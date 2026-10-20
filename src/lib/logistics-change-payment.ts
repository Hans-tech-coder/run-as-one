import 'server-only';
import db from '@/lib/db';
import { can, type Actor } from '@/lib/actor';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { formatPesos } from '@/lib/money';
import { formatEventInstant } from '@/lib/event-schedule';
import { PAYMENT_METHODS } from '@/lib/registration-codes';
import { changePayableState, isOutsidePayment, type ChangePayableState } from '@/lib/category-change-hold';
import { LOGISTICS_CHANGE_STATUSES, logisticsChangeDeadline } from '@/lib/logistics-change';
import { LogisticsChangeRefused } from '@/lib/logistics-change-context';
import { switchAwaitsAddress, switchHoldUntil } from '@/lib/logistics-change-proof';
import { applyLogisticsChange } from '@/lib/logistics-change-outcome';
import {
  logisticsChangeAppliedEmail,
  logisticsChangeCreatedEmail,
  sendLogisticsChangeEmail,
  type SwitchForEmail,
} from '@/lib/email-logistics-change';
import { deletePrivateFile } from '@/lib/blob';
import { lookUpPaymongoPayment } from '@/lib/online-payment';
import { retirePaymongoPage } from '@/lib/paymongo-session';
import { createSwitchPaymentToken, switchPaymentUrl } from '@/lib/resume-payment';
import { eventOrigin } from '@/lib/site-host';
import { EVENT_SITE_CLIENT } from '@/lib/site-client';

/**
 * **How a delivery switch's fee comes in, and what happens when it comes in
 * late** (LOGISTICS_CHANGE_PLAN.md L4, L11, L12; Session 3). The category
 * change's `category-change-payment.ts`, at a smaller size: no seat, no basis.
 *
 * Three doors, one write. Staff record a GCash or bank payment made outside
 * the app (`recordSwitchPayment`); PayMongo's webhook, the runner back from
 * PayMongo, or the checkout route finding an earlier page already paid settle
 * an online one (`settleSwitchOnline`). All end in `applyLogisticsChange`,
 * under the switch locks, which moves the order's logistics and never its
 * amounts (L4).
 *
 * **The money lands as real money on the switch row.** A payment recorded by
 * hand sets `totalCharged` to the switch's `fee` and `transactionFee` to zero:
 * a bank transfer carries no PayMongo cut. An online one keeps the fee the
 * checkout wrote.
 *
 * **A payment for a switch that is no longer waiting is never applied.** A
 * CANCELLED or EXPIRED switch, or one the apply refuses — the deadline passed
 * (L11: the courier's lead time is gone), the order no longer PAID or no
 * longer on pickup — is written to the trail as `logistics_change.payment_late`,
 * shown as a warning on Activity, and logged, for a person to refund, exactly
 * as a late upgrade payment is.
 *
 * The payment link (the third kind of resume-payment token) and both emails
 * are issued here too. Server-only.
 */

/** Who the trail names when PayMongo, not a person, moved the money. */
function paymongoActor(organizerId: string): AuditActor {
  return { kind: 'SYSTEM', id: null, orgId: organizerId, name: 'PayMongo', email: null };
}

const PAYMENT_INCLUDE = {
  ridesOn: { select: { orderRef: true } },
  orders: {
    select: {
      registration: {
        select: {
          id: true,
          orderRef: true,
          customerName: true,
          customerEmail: true,
          paymentMethod: true,
          // Runner 1's home address first: what the link offers to ship to (T1).
          runners: {
            where: { deletedAt: null },
            orderBy: { runnerNo: 'asc' },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              addressStreet: true,
              addressBarangay: true,
              addressCity: true,
              addressProvince: true,
            },
          },
        },
      },
    },
  },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      format: true,
      organizerId: true,
      logisticsChangeUntil: true,
      // The tiers the link re-quotes from (T2).
      province: true,
      location: true,
      logisticsDeliveryFeeInside: true,
      logisticsDeliveryFeeOutside: true,
      pickupLocation: true,
      pickupSchedule: true,
      client: EVENT_SITE_CLIENT,
      bankAccounts: {
        select: { id: true, bankName: true, accountName: true, accountNumber: true, qrImageUrl: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  },
} as const;

/** A switch with everything its link, its page and its emails read. */
export async function readSwitchForPayment(changeId: string) {
  return db.logisticsChange.findUnique({ where: { id: changeId }, include: PAYMENT_INCLUDE });
}

export type SwitchForPayment = NonNullable<Awaited<ReturnType<typeof readSwitchForPayment>>>;

/** The receipt a switch moves: one per switch since Revision 1 (R3). */
export function receiptOf(change: SwitchForPayment) {
  const order = change.orders[0]?.registration;
  if (!order) throw new LogisticsChangeRefused(404, 'Delivery switch not found');
  return order;
}

/**
 * Whether this switch can still be paid, by the rule the public page applies:
 * the category change's `changePayableState` with this race's switch deadline,
 * so a lapsed hold or a passed deadline reads as expired before the sweep runs.
 * A GCash or bank switch whose proof is in is judged without its hold
 * (Revision 3 T6, `logistics-change-proof.ts`): only the deadline closes it.
 */
export function switchPayableStateOf(change: SwitchForPayment, now: Date = new Date()): ChangePayableState {
  return changePayableState(
    { status: change.status, holdUntil: switchHoldUntil(change) },
    logisticsChangeDeadline(change.event),
    now,
  );
}

const REFUSALS: Record<Exclude<ChangePayableState, 'payable'>, string> = {
  applied: 'is already applied, so there is nothing left to pay. Reload the page.',
  cancelled: 'was cancelled, so it can no longer be paid.',
  expired: 'has expired, or switching has closed for this race. Open a new switch if the runner still wants delivery.',
};

/** The link for a switch and when it stops working, made from the switch itself. */
async function linkFor(change: SwitchForPayment, requestUrl: string) {
  const until = change.holdUntil ?? new Date();
  // A GCash or bank switch's link outlives its hold, up to the deadline: once
  // the proof is in, the hold no longer closes it (T6), and the runner may
  // still open the page to see or replace the proof (T7). The page judges the
  // rest (`switchPayableStateOf`).
  const deadline = logisticsChangeDeadline(change.event);
  const opensUntil = isOutsidePayment(change.paymentMethod) && deadline && deadline > until ? deadline : until;
  const token = await createSwitchPaymentToken(change.id, opensUntil);
  return { url: switchPaymentUrl(eventOrigin(change.event, requestUrl), token), until, untilLabel: formatEventInstant(until) };
}

export type IssuedSwitchLink =
  | { ok: true; change: SwitchForPayment; url: string; until: Date; untilLabel: string }
  | { ok: false; status: number; error: string };

/**
 * A payment link for an awaiting switch, handed to staff. `registration:email`
 * scoped to the switch's race, as a category change's link is: a link lets
 * whoever holds it pay. Never moves the hold.
 */
export async function issueSwitchPaymentLink(changeId: string, actor: Actor, requestUrl: string): Promise<IssuedSwitchLink> {
  const change = await readSwitchForPayment(changeId);
  if (!change) return { ok: false, status: 404, error: 'Delivery switch not found' };
  const reach = { organizerId: change.event.organizerId, eventId: change.eventId };
  if (!can(actor, 'registration:email', reach)) return { ok: false, status: 404, error: 'Delivery switch not found' };

  const state = switchPayableStateOf(change);
  if (state !== 'payable') return { ok: false, status: 409, error: `${change.changeRef} ${REFUSALS[state]}` };
  return { ok: true, change, ...(await linkFor(change, requestUrl)) };
}

function emailFields(change: SwitchForPayment): SwitchForEmail {
  const order = receiptOf(change);
  return {
    ...change,
    order: {
      orderRef: order.orderRef,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      kits: order.runners.length,
    },
  };
}

export type SwitchEmailKind = 'created' | 'applied';

/**
 * One of a switch's two emails, rendered. The created one carries its link
 * however the fee is paid (Revision 3 T9): the runner confirms the delivery
 * details and pays, online or with the GCash or bank proof, on that page.
 */
export async function renderSwitchEmail(change: SwitchForPayment, kind: SwitchEmailKind, requestUrl: string | null) {
  if (kind === 'applied') return logisticsChangeAppliedEmail(emailFields(change));
  const url = requestUrl ? (await linkFor(change, requestUrl)).url : null;
  return logisticsChangeCreatedEmail(emailFields(change), url);
}

/**
 * Sends one of a switch's emails and stamps the outcome on it, after the write
 * that it reports has committed: a Resend outage never rolls back a switch. A
 * refusal comes back with the rendered message for the by-hand send.
 * `requestUrl` gives the created email's link its host; the applied email
 * needs none, which is how the webhook sends it.
 */
export async function deliverSwitchEmail(changeId: string, kind: SwitchEmailKind, requestUrl: string | null = null) {
  const change = await readSwitchForPayment(changeId);
  if (!change) throw new LogisticsChangeRefused(404, 'Delivery switch not found');
  const message = await renderSwitchEmail(change, kind, requestUrl);
  const outcome = await sendLogisticsChangeEmail(message);
  const sentAt = kind === 'created' ? { createdEmailSentAt: new Date() } : { appliedEmailSentAt: new Date() };
  await db.logisticsChange.update({
    where: { id: changeId },
    data: outcome.sent ? { ...sentAt, lastEmailError: null } : { lastEmailError: outcome.error },
  });
  const rendered = { to: message.to, subject: message.subject, html: message.html, text: message.text };
  return outcome.sent
    ? { sent: true as const, to: message.to }
    : { sent: false as const, error: outcome.error, message: rendered };
}

/** Staff sent a switch's email from their own mailbox: stamp it and say who. */
export async function markSwitchEmailSentByHand(actor: AuditActor, changeId: string, kind: SwitchEmailKind) {
  const change = await readSwitchForPayment(changeId);
  if (!change) throw new LogisticsChangeRefused(404, 'Delivery switch not found');
  const order = receiptOf(change);
  await db.$transaction(async tx => {
    await tx.logisticsChange.update({
      where: { id: changeId },
      data:
        kind === 'applied'
          ? { appliedEmailSentAt: new Date(), lastEmailError: null }
          : { createdEmailSentAt: new Date(), lastEmailError: null },
    });
    await recordAudit(tx, actor, {
      action: 'logistics_change.email.sent_by_hand',
      entityType: 'LogisticsChange',
      entityId: change.id,
      eventId: change.eventId,
      organizerId: change.event.organizerId,
      summary: `Marked the delivery switch ${kind === 'created' ? 'payment ' : ''}email to ${order.customerEmail} as sent by hand (${change.changeRef}, order ${order.orderRef}).`,
    });
  });
}

/**
 * Closes a switch's PayMongo page, if one was opened, so it can no longer take
 * money: after a cancel, an expiry, or a payment recorded by hand. Best effort
 * and after the write; a payment that still lands on it is caught as late.
 */
export async function retireSwitchPage(change: { changeRef: string; checkoutSessionId: string | null }) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!change.checkoutSessionId || !secretKey) return;
  const retired = await retirePaymongoPage(secretKey, change.checkoutSessionId);
  if (!retired.ok) console.error(`Delivery switch ${change.changeRef}: its PayMongo page would not close; ${retired.error}`);
}

/** What staff record for a payment made outside the app. */
export type OutsideSwitchPayment = { transactionNumber: string; proofPathname: string | null };

/**
 * A GCash or bank payment staff saw land, recorded against an awaiting switch,
 * which applies it (`registration:validate` at the route). A switch opened for
 * an online payment is PayMongo's to report and is refused here; a page opened
 * for this one is asked first whether it was paid, so the runner is never
 * counted as paying twice.
 */
export async function recordSwitchPayment(actor: AuditActor, changeId: string, payment: OutsideSwitchPayment) {
  const change = await db.logisticsChange.findUnique({
    where: { id: changeId },
    select: {
      fee: true,
      checkoutSessionId: true,
      changeRef: true,
      paymentMethod: true,
      proofOfPayment: true,
      status: true,
      direction: true,
      deliveryAddress: true,
      deliverySplit: true,
    },
  });
  if (!change) throw new LogisticsChangeRefused(404, 'Delivery switch not found');
  if (switchAwaitsAddress(change)) throw new LogisticsChangeRefused(409, "The runner has not confirmed the delivery address yet, so there is nothing to apply. It waits on the link.");
  if (!isOutsidePayment(change.paymentMethod)) {
    throw new LogisticsChangeRefused(
      409,
      `${change.changeRef} is paid online through PayMongo, so it applies when PayMongo confirms the payment, not by hand.`,
    );
  }

  if (change.checkoutSessionId) {
    const lookup = await lookUpPaymongoPayment(change.checkoutSessionId);
    if ('paid' in lookup && lookup.paid) {
      await settleSwitchOnline(changeId);
      throw new LogisticsChangeRefused(
        409,
        `${change.changeRef} was already paid online through its payment link, so it has been applied from that payment. Reload the page; check the GCash or bank payment again before treating it as a second one.`,
      );
    }
  }

  // The runner's own screenshot from the link (Revision 3 T5) stays unless
  // staff attach another, which replaces it.
  const applied = await applyLogisticsChange(actor, changeId, {
    paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
    transactionNumber: payment.transactionNumber,
    ...(payment.proofPathname ? { proofOfPayment: payment.proofPathname } : {}),
    transactionFee: 0,
    totalCharged: change.fee,
  });
  if (payment.proofPathname && change.proofOfPayment && change.proofOfPayment !== payment.proofPathname) {
    await deletePrivateFile(change.proofOfPayment).catch(error =>
      console.error(`Delivery switch ${change.changeRef}: the replaced proof could not be deleted`, error),
    );
  }
  await retireSwitchPage(change);
  return applied;
}

/** Writes the late-payment row and logs it: money a person has to deal with. */
async function flagLatePayment(changeId: string, why: string) {
  const change = await readSwitchForPayment(changeId);
  if (!change) return;
  const order = change.orders[0]?.registration;
  const summary = `A PayMongo payment of ₱${formatPesos(change.totalCharged)} arrived for delivery switch ${change.changeRef}${order ? ` (order ${order.orderRef})` : ''} while it was ${change.status}: ${why} It was not applied; refund it, or switch the order again if it can still ship.`;
  console.error(`PayMongo Webhook: ${summary}`);
  await recordAudit(db, paymongoActor(change.event.organizerId), {
    action: 'logistics_change.payment_late',
    entityType: 'LogisticsChange',
    entityId: change.id,
    eventId: change.eventId,
    organizerId: change.event.organizerId,
    summary,
    changes: { status: change.status, checkoutSessionId: change.checkoutSessionId },
  });
}

export type SwitchSettleOutcome =
  | { outcome: 'applied' }
  | { outcome: 'already_applied' }
  /** Closed, or refused on apply: flagged for a person, nothing changed. */
  | { outcome: 'late'; status: string };

/**
 * An online payment for a switch: applies an awaiting one with the figures its
 * checkout wrote and sends the *switched* email on the apply alone. A retried
 * delivery finds it applied and does nothing; a closed switch, or one the
 * apply refuses, is flagged and never applied.
 *
 * `paidPageId` is the page PayMongo says was paid. When it is not the page the
 * switch points at (one that lost the checkout's claim and would not close),
 * the claimed page is closed after the apply, so the runner cannot pay twice.
 */
export async function settleSwitchOnline(changeId: string, paidPageId?: string): Promise<SwitchSettleOutcome> {
  const change = await db.logisticsChange.findUnique({
    where: { id: changeId },
    select: { status: true, changeRef: true, checkoutSessionId: true, event: { select: { organizerId: true } } },
  });
  if (!change) return { outcome: 'late', status: 'MISSING' };
  if (change.status === LOGISTICS_CHANGE_STATUSES.CANCELLED || change.status === LOGISTICS_CHANGE_STATUSES.EXPIRED) {
    await flagLatePayment(changeId, 'the switch was already closed, so the kits stayed on pickup.');
    return { outcome: 'late', status: change.status };
  }
  if (change.status !== LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT) return { outcome: 'already_applied' };

  try {
    await applyLogisticsChange(paymongoActor(change.event.organizerId), changeId);
  } catch (error) {
    if (!(error instanceof LogisticsChangeRefused)) throw error;
    const now = await db.logisticsChange.findUnique({ where: { id: changeId }, select: { status: true } });
    if (now?.status !== LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT) return { outcome: 'already_applied' };
    await flagLatePayment(changeId, error.message);
    return { outcome: 'late', status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT };
  }
  if (paidPageId && change.checkoutSessionId && change.checkoutSessionId !== paidPageId) {
    await retireSwitchPage(change);
  }
  await deliverSwitchEmail(changeId, 'applied').catch(error => console.error('Delivery switch email failed:', error));
  return { outcome: 'applied' };
}

/**
 * The switch a PayMongo event names: by the page id the checkout stored, then
 * by `reference_number`, which a switch's page carries as its `changeRef`.
 */
export async function findSwitchForPayment(pageId: string, referenceNumber: string) {
  if (pageId) {
    const byPage = await db.logisticsChange.findFirst({ where: { checkoutSessionId: pageId }, select: { id: true, changeRef: true } });
    if (byPage) return byPage;
  }
  if (referenceNumber) {
    return db.logisticsChange.findUnique({ where: { changeRef: referenceNumber }, select: { id: true, changeRef: true } });
  }
  return null;
}
