import 'server-only';
import db from '@/lib/db';
import { can, type Actor } from '@/lib/actor';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { formatPesos } from '@/lib/money';
import { formatEventInstant } from '@/lib/event-schedule';
import { PAYMENT_METHODS } from '@/lib/registration-codes';
import { categoryChangeDeadline } from '@/lib/category-change';
import { changePayableState, isOutsidePayment, type ChangePayableState } from '@/lib/category-change-hold';
import { CategoryChangeRefused } from '@/lib/category-change-context';
import { applyCategoryChange } from '@/lib/category-change-store';
import { deliverAppliedEmail } from '@/lib/category-change-view';
import { categoryChangeCreatedEmail, sendCategoryChangeEmail } from '@/lib/email-category-change';
import { lookUpPaymongoPayment } from '@/lib/online-payment';
import { retirePaymongoPage } from '@/lib/paymongo-session';
import { changePaymentUrl, createChangePaymentToken } from '@/lib/resume-payment';
import { eventOrigin } from '@/lib/site-host';
import { EVENT_SITE_CLIENT } from '@/lib/site-client';

/**
 * **How an upgrade's money comes in, and what happens when it comes in late**
 * (CATEGORY_CHANGE_PLAN.md D11, D13, *Risks*; Session 3).
 *
 * Three doors, one write. Staff record a GCash or bank payment made outside
 * the app (`recordChangePayment`); PayMongo's webhook, or the checkout route
 * finding an earlier page already paid, settles an online one
 * (`settleChangeOnline`). Both end in `applyCategoryChange`, under the event
 * lock, so they cannot disagree about which changes may apply.
 *
 * **The money lands as real money on the change row.** A payment recorded by
 * hand sets `totalCharged` to the change's `amount` and `transactionFee` to
 * zero, whatever the change was opened expecting: a bank transfer carries no
 * PayMongo cut (D13), and the basis is never bent to make an amount already
 * paid come out at zero. An online one keeps the fee the checkout wrote.
 *
 * **A payment for a change that is no longer waiting is never applied.** An
 * EXPIRED or CANCELLED change has let its seat go, and a refused apply (the
 * runner moved another way, the order no longer paid, the lapsed seat taken)
 * would put a runner somewhere nobody can promise. Each is written to the
 * trail as `category_change.payment_late` — shown as a warning on Activity —
 * and logged, for a person to refund or reopen, exactly as a late order
 * payment is (lib/online-payment.ts).
 *
 * The payment link — the second kind of resume-payment token — is issued here
 * too (`issueChangePaymentLink`), with the created email that carries it.
 * Server-only.
 */

/** Who the trail names when PayMongo, not a person, moved the money. */
function paymongoActor(organizerId: string): AuditActor {
  return { kind: 'SYSTEM', id: null, orgId: organizerId, name: 'PayMongo', email: null };
}

const LINK_INCLUDE = {
  fromCategory: { select: { name: true, distance: true } },
  toCategory: { select: { name: true, distance: true } },
  runner: { select: { firstName: true, lastName: true, email: true } },
  registration: { select: { orderRef: true } },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      organizerId: true,
      categoryChangeUntil: true,
      client: EVENT_SITE_CLIENT,
      bankAccounts: {
        select: { bankName: true, accountName: true, accountNumber: true, qrImageUrl: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  },
} as const;

/** A change with everything its link, its page and its created email read. */
export async function readChangeForPayment(changeId: string) {
  return db.categoryChange.findUnique({ where: { id: changeId }, include: LINK_INCLUDE });
}

export type ChangeForPayment = NonNullable<Awaited<ReturnType<typeof readChangeForPayment>>>;

/** Whether this change can still be paid, by the rule the public page applies. */
export function payableStateOf(change: ChangeForPayment, now: Date = new Date()): ChangePayableState {
  return changePayableState(change, categoryChangeDeadline(change.event), now);
}

const REFUSALS: Record<Exclude<ChangePayableState, 'payable'>, string> = {
  applied: 'is already applied, so there is nothing left to pay. Reload the page.',
  cancelled: 'was cancelled, so it can no longer be paid.',
  expired: 'has expired: its held seat was released. Open a new change if the runner still wants to move.',
};

/** The link for a change and when it stops working, made from the change itself. */
async function linkFor(change: ChangeForPayment, requestUrl: string) {
  // The link lives exactly as long as the seat is held.
  const until = change.holdUntil ?? new Date();
  const token = await createChangePaymentToken(change.id, until);
  return { url: changePaymentUrl(eventOrigin(change.event, requestUrl), token), until, untilLabel: formatEventInstant(until) };
}

export type IssuedChangeLink =
  | { ok: true; change: ChangeForPayment; url: string; until: Date; untilLabel: string }
  | { ok: false; status: number; error: string };

/**
 * A payment link for an awaiting upgrade, handed to staff. `registration:email`
 * scoped to the change's race, as an order's link is (lib/payment-link.ts): a
 * link lets whoever holds it pay, so it goes out on the permission of any other
 * message to the runner. Never moves the hold — the seat was held for the
 * method's window when the change was opened, and a second link must not
 * stretch it.
 */
export async function issueChangePaymentLink(
  changeId: string,
  actor: Actor,
  requestUrl: string,
): Promise<IssuedChangeLink> {
  const change = await readChangeForPayment(changeId);
  if (!change) return { ok: false, status: 404, error: 'Category change not found' };
  const reach = { organizerId: change.event.organizerId, eventId: change.eventId };
  if (!can(actor, 'registration:email', reach)) return { ok: false, status: 404, error: 'Category change not found' };

  const state = payableStateOf(change);
  if (state !== 'payable') return { ok: false, status: 409, error: `${change.changeRef} ${REFUSALS[state]}` };
  return { ok: true, change, ...(await linkFor(change, requestUrl)) };
}

/** The created email for a change, rendered, with its link when it is paid online. */
export async function renderCreatedEmail(change: ChangeForPayment, requestUrl: string) {
  const outside = change.paymentMethod === PAYMENT_METHODS.BANK_TRANSFER;
  const url = outside ? null : (await linkFor(change, requestUrl)).url;
  return categoryChangeCreatedEmail(change, url);
}

/**
 * Sends the created email and stamps the outcome on the change, after the
 * write that opened it has committed. A refusal comes back with the rendered
 * message, so the modal goes straight to the by-hand send.
 */
export async function deliverCreatedEmail(changeId: string, requestUrl: string) {
  const change = await readChangeForPayment(changeId);
  if (!change) throw new CategoryChangeRefused(404, 'Category change not found');
  const message = await renderCreatedEmail(change, requestUrl);
  const outcome = await sendCategoryChangeEmail(message);
  await db.categoryChange.update({
    where: { id: changeId },
    data: outcome.sent ? { createdEmailSentAt: new Date(), lastEmailError: null } : { lastEmailError: outcome.error },
  });
  const rendered = { to: message.to, subject: message.subject, html: message.html, text: message.text };
  return outcome.sent
    ? { sent: true as const, to: message.to }
    : { sent: false as const, error: outcome.error, message: rendered };
}

/**
 * Closes a change's PayMongo page, if one was opened, so it can no longer take
 * money: after a cancel, an expiry, or a payment recorded by hand. Best effort
 * and after the write, because the change is already closed either way; a page
 * that will not close is logged, and a payment that still lands on it is caught
 * as late by `settleChangeOnline`.
 */
export async function retireChangePage(change: { changeRef: string; checkoutSessionId: string | null }) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!change.checkoutSessionId || !secretKey) return;
  const retired = await retirePaymongoPage(secretKey, change.checkoutSessionId);
  if (!retired.ok) console.error(`Category change ${change.changeRef}: its PayMongo page would not close; ${retired.error}`);
}

/** What staff record for a payment made outside the app. */
export type OutsidePayment = { transactionNumber: string; proofPathname: string | null };

/**
 * A GCash or bank payment staff saw land, recorded against an awaiting
 * upgrade, which applies it (`registration:validate` at the route). Before
 * anything is written, an online page opened for the same change is asked
 * whether it was paid: if it was, that payment settles the change and this
 * record is refused, so the runner is never counted as paying twice. Otherwise
 * the page is closed after the change applies.
 */
export async function recordChangePayment(actor: AuditActor, changeId: string, payment: OutsidePayment) {
  const change = await db.categoryChange.findUnique({
    where: { id: changeId },
    select: { amount: true, checkoutSessionId: true, changeRef: true, paymentMethod: true },
  });
  if (!change) throw new CategoryChangeRefused(404, 'Category change not found');
  // Online is PayMongo's to report (webhook, or the runner reopening the link);
  // a by-hand record would be a second account of the same money.
  if (!isOutsidePayment(change.paymentMethod)) {
    throw new CategoryChangeRefused(
      409,
      `${change.changeRef} is paid online through PayMongo, so it applies when PayMongo confirms the payment, not by hand.`,
    );
  }

  if (change.checkoutSessionId) {
    const lookup = await lookUpPaymongoPayment(change.checkoutSessionId);
    if ('paid' in lookup && lookup.paid) {
      await settleChangeOnline(changeId);
      throw new CategoryChangeRefused(
        409,
        `${change.changeRef} was already paid online through its payment link, so it has been applied from that payment. Reload the page; check the GCash or bank payment again before treating it as a second one.`,
      );
    }
  }

  const applied = await applyCategoryChange(actor, changeId, {
    paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
    transactionNumber: payment.transactionNumber,
    proofOfPayment: payment.proofPathname,
    transactionFee: 0,
    totalCharged: change.amount,
  });
  await retireChangePage(change);
  return applied;
}

/** Writes the late-payment row and logs it: money a person has to deal with. */
async function flagLatePayment(changeId: string, why: string) {
  const change = await db.categoryChange.findUnique({
    where: { id: changeId },
    include: { event: { select: { organizerId: true } }, registration: { select: { orderRef: true } } },
  });
  if (!change) return;
  const summary = `A PayMongo payment of ₱${formatPesos(change.totalCharged)} arrived for category change ${change.changeRef} (order ${change.registration.orderRef}) while it was ${change.status}: ${why} It was not applied; refund it or open the change again.`;
  console.error(`PayMongo Webhook: ${summary}`);
  await recordAudit(db, paymongoActor(change.event.organizerId), {
    action: 'category_change.payment_late',
    entityType: 'CategoryChange',
    entityId: change.id,
    eventId: change.eventId,
    organizerId: change.event.organizerId,
    summary,
    changes: { status: change.status, checkoutSessionId: change.checkoutSessionId },
  });
}

export type ChangeSettleOutcome =
  | { outcome: 'applied' }
  | { outcome: 'already_applied' }
  /** Closed, or refused on apply: flagged for a person, nothing changed. */
  | { outcome: 'late'; status: string };

/**
 * An online payment for a change, from PayMongo's webhook or found by the
 * checkout route: applies an awaiting change with the figures its checkout
 * wrote, and sends the applied email on the apply alone. A retried delivery
 * finds it applied and does nothing; a closed change is flagged, never applied.
 *
 * `paidPageId` is the page PayMongo says was paid. When it is not the page the
 * change points at (a page that lost the checkout's claim and would not
 * close, found by its reference), the claimed page is closed after the apply,
 * so the runner cannot pay a second time on it.
 */
export async function settleChangeOnline(changeId: string, paidPageId?: string): Promise<ChangeSettleOutcome> {
  const change = await db.categoryChange.findUnique({
    where: { id: changeId },
    select: { status: true, changeRef: true, checkoutSessionId: true, event: { select: { organizerId: true } } },
  });
  if (!change) return { outcome: 'late', status: 'MISSING' };
  if (change.status === 'CANCELLED' || change.status === 'EXPIRED') {
    await flagLatePayment(changeId, 'the change was already closed, so its seat was released.');
    return { outcome: 'late', status: change.status };
  }
  if (change.status !== 'AWAITING_PAYMENT') return { outcome: 'already_applied' };

  try {
    // The figures the checkout wrote when it opened the page stay as they are.
    await applyCategoryChange(paymongoActor(change.event.organizerId), changeId);
  } catch (error) {
    if (!(error instanceof CategoryChangeRefused)) throw error;
    const now = await db.categoryChange.findUnique({ where: { id: changeId }, select: { status: true } });
    if (now?.status !== 'AWAITING_PAYMENT') return { outcome: 'already_applied' };
    await flagLatePayment(changeId, error.message);
    return { outcome: 'late', status: 'AWAITING_PAYMENT' };
  }
  if (paidPageId && change.checkoutSessionId && change.checkoutSessionId !== paidPageId) {
    await retireChangePage(change);
  }
  await deliverAppliedEmail(changeId).catch(error => console.error('Category change email failed:', error));
  return { outcome: 'applied' };
}

/**
 * The change a PayMongo event names: by the page id the checkout stored, then
 * by `reference_number`, which a change's page carries as its `changeRef`.
 */
export async function findChangeForPayment(pageId: string, referenceNumber: string) {
  if (pageId) {
    const byPage = await db.categoryChange.findFirst({ where: { checkoutSessionId: pageId }, select: { id: true, changeRef: true } });
    if (byPage) return byPage;
  }
  if (referenceNumber) {
    return db.categoryChange.findUnique({ where: { changeRef: referenceNumber }, select: { id: true, changeRef: true } });
  }
  return null;
}
