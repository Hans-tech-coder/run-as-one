import 'server-only';
import { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { recordAudit, type AuditActor, type AuditEntry } from '@/lib/audit';
import { formatPesos } from '@/lib/money';
import { paymentMethodLabel } from '@/lib/registration-codes';
import {
  CATEGORY_CHANGE_STATUSES,
  categoryChangeDeadline,
  categoryChangeRef,
} from '@/lib/category-change';
import { DOWNGRADES_ON_HOLD, DOWNGRADE_ON_HOLD_COPY } from '@/lib/category-change-settings';
import { changeHeldUntil, changeHoldUntil, holdLapsed, paymentChoicesForOrder, paymentMethodForChoice } from '@/lib/category-change-hold';
import { CategoryChangeRefused, eligibilityFor, quoteFor } from '@/lib/category-change-context';
import { claimSeat, lockChange, lockRunner } from '@/lib/category-change-locks';

/**
 * **Every write to a category change, each in one transaction under the event
 * lock with its audit row** (CATEGORY_CHANGE_PLAN.md D1, D8–D12).
 *
 * The rule this owns: a runner's category moves only here, and only together
 * with the `CategoryChange` row that explains it. Applying a change sets
 * `Runner.categoryId` and clears `Runner.promoPrice` in the same transaction
 * (the plan's *Risks* decision — the basis was already snapshotted on the row),
 * so there is no moment at which a runner stands in the new category with no
 * record of why, or at the old sale price of a category they left.
 *
 * **The locks, in order** — event, runner, target category — are
 * `category-change-locks.ts`; the runner lock is what keeps D10's "one open
 * change" from being raced.
 *
 * **Every figure comes from `quoteCategoryChange`**, recomputed inside the
 * transaction from what the database holds now. The modal's preview runs the
 * same function in the browser, so what staff confirmed is what is written;
 * the server never trusts a figure posted to it. The read they are computed
 * from is `category-change-context.ts`; the screen's view of a change and the
 * applied email's delivery are `category-change-view.ts`.
 *
 * A move with nothing to pay (lateral, and downgrades under either refund
 * policy) applies at once. An upgrade waits for payment (`AWAITING_PAYMENT`),
 * opened with the way staff chose it is paid, which sets its transaction fee
 * (D13) and its hold (`category-change-hold.ts`); it applies here once paid,
 * from staff's record or PayMongo's webhook (`category-change-payment.ts`).
 */

function peso(centavos: number): string {
  return `₱${formatPesos(centavos)}`;
}

/** The sentence the trail keeps for a move, with the money it settled. */
function appliedSummary(
  change: { changeRef: string; status: string; amount: number; refundAmount: number; totalCharged: number },
  who: string,
  from: string,
  to: string,
  orderRef: string,
): string {
  const money =
    change.status === CATEGORY_CHANGE_STATUSES.REFUND_DUE
      ? `${peso(change.refundAmount)} to refund`
      : change.totalCharged > 0
        ? `${peso(change.totalCharged)} paid`
        : change.amount < 0
          ? `${peso(-change.amount)} not refunded under the race's policy`
          : 'nothing to pay';
  return `Changed ${who}'s category from ${from} to ${to} (${change.changeRef}, order ${orderRef}): ${money}.`;
}

export type CreateChangeInput = {
  runnerId: string;
  toCategoryId: string;
  /** What the runner asked for, in staff's words. */
  reason?: string | null;
  basisAdjustment?: { basis: number; reason: string } | null;
  /**
   * How an upgrade will be paid, stored form (`QRPH`, `BANK_TRANSFER`), from
   * `paymentMethodForChoice`. Required when there is something to pay: it sets
   * the transaction fee (D13) and the hold. Ignored when there is nothing to pay.
   */
  paymentMethod?: string | null;
};

/**
 * Starts a change. With nothing to pay it is applied in the same transaction:
 * the row is written APPLIED or REFUND_DUE (D8) and the runner moved. With
 * something to pay it is written AWAITING_PAYMENT holding a seat in the target.
 */
export async function createCategoryChange(actor: AuditActor, input: CreateChangeInput) {
  return db.$transaction(async tx => {
    const ctx = await lockRunner(tx, input.runnerId);
    const to = ctx.event.categories.find(c => c.id === input.toCategoryId);
    if (!to) throw new CategoryChangeRefused(400, "Choose one of this race's categories.");

    const now = new Date();
    const eligibility = eligibilityFor(ctx, to.id, now);
    if (!eligibility.allowed) throw new CategoryChangeRefused(409, eligibility.message);

    const method = input.paymentMethod ?? null;
    const quote = quoteFor(ctx, to, input.basisAdjustment ?? null, method);
    if (DOWNGRADES_ON_HOLD && quote.direction === 'DOWNGRADE') throw new CategoryChangeRefused(409, DOWNGRADE_ON_HOLD_COPY);
    const awaiting = quote.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT;
    if (awaiting && !method) {
      throw new CategoryChangeRefused(400, `Choose how the runner pays the ${peso(quote.amount)}.`);
    }
    // Paid the way the entry was paid (category-change-hold.ts).
    if (awaiting && !paymentChoicesForOrder(ctx.registration.paymentMethod).some(c => paymentMethodForChoice(c) === method)) {
      const paid = paymentMethodLabel(ctx.registration.paymentMethod);
      throw new CategoryChangeRefused(
        400,
        `This runner paid ${paid === 'Online' ? 'online' : `by ${paid}`}; the difference is paid the same way.`,
      );
    }

    await claimSeat(tx, to);

    const holdUntil = awaiting ? changeHoldUntil(method, now, categoryChangeDeadline(ctx.event)) : null;
    const from = ctx.runner.category;
    const who = `${ctx.runner.firstName} ${ctx.runner.lastName}`;

    const change = await tx.categoryChange.create({
      data: {
        changeRef: categoryChangeRef(ctx.runnerRef, ctx.changeCount + 1),
        eventId: ctx.event.id,
        registrationId: ctx.registration.id,
        runnerId: ctx.runner.id,
        fromCategoryId: from.id,
        toCategoryId: to.id,
        basis: quote.basis,
        basisEstimated: quote.basisEstimated,
        basisAdjustReason: quote.basisAdjustReason,
        toPrice: quote.toPrice,
        changeFee: quote.changeFee,
        difference: quote.difference,
        amount: quote.amount,
        transactionFee: quote.transactionFee,
        totalCharged: quote.totalCharged,
        refundAmount: quote.refundAmount,
        fromInclusions: from.inclusions,
        toInclusions: to.inclusions,
        status: quote.status,
        paymentMethod: awaiting ? method : null,
        holdUntil,
        reason: input.reason?.trim() || null,
        createdBy: actor.name.trim() || actor.email || 'Unknown',
        // One instant for both, so a move made at once never reads as applied
        // before it was made.
        createdAt: now,
        appliedAt: awaiting ? null : now,
      },
    });

    const trail = {
      entityType: 'CategoryChange' as const,
      entityId: change.id,
      eventId: ctx.event.id,
      organizerId: ctx.event.organizerId,
    };
    const changes = {
      category: [from.name, to.name] as [string, string],
      basis: quote.basis,
      amount: quote.amount,
      ...(quote.basisAdjustReason
        ? { computedBasis: quote.computedBasis, basisAdjustReason: quote.basisAdjustReason }
        : {}),
    };
    const entries: AuditEntry[] = [];

    if (awaiting) {
      entries.push({
        ...trail,
        action: 'category_change.created',
        summary: `Opened a category change for ${who} from ${from.name} to ${to.name} (${change.changeRef}, order ${ctx.registration.orderRef}): ${peso(quote.totalCharged)} to pay by ${paymentMethodLabel(method)}.`,
        changes: { ...changes, paymentMethod: method, holdUntil: holdUntil?.toISOString() ?? null },
      });
    } else {
      await tx.runner.update({
        where: { id: ctx.runner.id },
        data: { categoryId: to.id, promoPrice: null },
      });
      entries.push({
        ...trail,
        action: 'category_change.applied',
        summary: appliedSummary(change, who, from.name, to.name, ctx.registration.orderRef),
        changes: { ...changes, status: change.status },
      });
    }
    await recordAudit(tx, actor, entries);
    return change;
  });
}

/** Payment details an awaiting change is applied with, from staff's record or PayMongo's. */
export type AppliedPayment = Partial<
  Pick<
    Prisma.CategoryChangeUncheckedUpdateInput,
    'paymentMethod' | 'checkoutSessionId' | 'proofOfPayment' | 'transactionNumber' | 'transactionFee' | 'totalCharged'
  >
>;

/**
 * The proof staff's record was judged against (`recordChangePayment`). The
 * runner can replace it on the link meanwhile; the claim refuses then, so a
 * proof staff never saw is not the one validated.
 */
export type ExpectedChange = { proofOfPayment: string | null };

/**
 * Applies an awaiting upgrade once it is paid (`category-change-payment.ts`:
 * staff's record of a GCash or bank payment, and PayMongo's webhook). The seat
 * was held since the change was opened, so nothing is counted: the held seat
 * simply becomes the runner's. Claimed with a conditional write, so a webhook
 * retried twice applies it once.
 *
 * Refused, and rolled back for a person to settle, when the runner was moved
 * some other way since, or their order is no longer PAID (D9). **A hold that
 * lapsed before the money landed** — the sweep runs once a day, so a change
 * can sit AWAITING_PAYMENT past its time — no longer holds a seat
 * (`slot-holds.ts`), so the seat is taken again only if one is free.
 */
export async function applyCategoryChange(
  actor: AuditActor,
  changeId: string,
  payment: AppliedPayment = {},
  expected?: ExpectedChange,
) {
  return db.$transaction(async tx => {
    const existing = await tx.categoryChange.findUnique({
      where: { id: changeId },
      select: { runnerId: true },
    });
    if (!existing) throw new CategoryChangeRefused(404, 'Category change not found');
    const ctx = await lockRunner(tx, existing.runnerId);

    const now = new Date();
    const before = await tx.categoryChange.findUniqueOrThrow({
      where: { id: changeId },
      select: { status: true, holdUntil: true, toCategoryId: true, paymentMethod: true, proofOfPayment: true },
    });
    if (before.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT) {
      if (ctx.registration.status !== 'PAID') {
        throw new CategoryChangeRefused(
          409,
          `Order ${ctx.registration.orderRef} is no longer paid, so this runner cannot be moved.`,
        );
      }
      // A hold the runner's proof kept (`changeHeldUntil`) still holds its seat.
      if (holdLapsed(changeHeldUntil(before), now)) {
        const to = ctx.event.categories.find(c => c.id === before.toCategoryId);
        if (to) await claimSeat(tx, to);
      }
    }

    const claim = await tx.categoryChange.updateMany({
      where: { id: changeId, status: CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT, ...expected },
      data: { ...payment, status: CATEGORY_CHANGE_STATUSES.APPLIED, appliedAt: now } as Prisma.CategoryChangeUpdateManyMutationInput,
    });
    if (claim.count === 0) {
      if (expected && before.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT) {
        throw new CategoryChangeRefused(
          409,
          'The runner replaced the proof on the link while this payment was being recorded. Reload the page and check the new proof.',
        );
      }
      throw new CategoryChangeRefused(409, 'This category change is no longer waiting for payment. Reload the page.');
    }
    const change = await tx.categoryChange.findUniqueOrThrow({
      where: { id: changeId },
      include: { fromCategory: { select: { name: true } }, toCategory: { select: { name: true } } },
    });
    if (ctx.runner.categoryId !== change.fromCategoryId) {
      // Moved some other way since the change was opened; applying would put
      // them somewhere nobody asked for. Rolled back for a person to settle.
      throw new CategoryChangeRefused(409, 'This runner is no longer in the category the change started from.');
    }
    await tx.runner.update({
      where: { id: ctx.runner.id },
      data: { categoryId: change.toCategoryId, promoPrice: null },
    });
    const how = [
      change.paymentMethod ? ` by ${paymentMethodLabel(change.paymentMethod)}` : '',
      change.transactionNumber ? `, reference ${change.transactionNumber}` : '',
    ].join('');
    await recordAudit(tx, actor, {
      action: 'category_change.applied',
      entityType: 'CategoryChange',
      entityId: change.id,
      eventId: ctx.event.id,
      organizerId: ctx.event.organizerId,
      summary: appliedSummary(
        change,
        `${ctx.runner.firstName} ${ctx.runner.lastName}`,
        change.fromCategory.name,
        change.toCategory.name,
        ctx.registration.orderRef,
      ).replace(/\.$/, `${how}.`),
      changes: {
        category: [change.fromCategory.name, change.toCategory.name],
        status: change.status,
        totalCharged: change.totalCharged,
        transactionFee: change.transactionFee,
        ...(change.paymentMethod ? { paymentMethod: change.paymentMethod } : {}),
        ...(change.transactionNumber ? { transactionNumber: change.transactionNumber } : {}),
        ...(change.proofOfPayment ? { proofOfPayment: 'attached' } : {}),
      },
    });
    return change;
  });
}

/**
 * Withdraws an awaiting upgrade; its held seat is released by the status alone.
 * Its PayMongo page, if one was opened, is closed by the caller after this
 * commits (`retireChangePage`), so a runner holding the link cannot pay for a
 * change that no longer exists.
 */
export async function cancelCategoryChange(actor: AuditActor, changeId: string) {
  return db.$transaction(async tx => {
    const { change, ctx, who } = await lockChange(tx, changeId);
    const by = actor.name.trim() || actor.email || 'Unknown';
    const claim = await tx.categoryChange.updateMany({
      where: { id: changeId, status: CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT },
      data: { status: CATEGORY_CHANGE_STATUSES.CANCELLED, cancelledAt: new Date(), cancelledBy: by },
    });
    if (claim.count === 0) {
      throw new CategoryChangeRefused(409, 'Only a change waiting for payment can be cancelled. Reload the page.');
    }
    await recordAudit(tx, actor, {
      action: 'category_change.cancelled',
      entityType: 'CategoryChange',
      entityId: change.id,
      eventId: ctx.event.id,
      organizerId: ctx.event.organizerId,
      summary: `Cancelled the category change for ${who} from ${change.fromCategory.name} to ${change.toCategory.name} (${change.changeRef}, order ${ctx.registration.orderRef}).`,
      changes: { status: [change.status, CATEGORY_CHANGE_STATUSES.CANCELLED] },
    });
    return tx.categoryChange.findUniqueOrThrow({ where: { id: changeId } });
  });
}

/** The longest refund reference kept: a GCash or bank reference, never a paragraph. */
export const MAX_REFUND_REFERENCE = 100;

/** The posted reference, trimmed, or the sentence saying what is wrong. */
export function readRefundReference(raw: unknown): { value: string | null; error: string | null } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { value: null, error: 'Enter the GCash or bank reference of the refund' };
  if (value.length > MAX_REFUND_REFERENCE) {
    return { value: null, error: `Keep the reference to ${MAX_REFUND_REFERENCE} characters` };
  }
  return { value, error: null };
}

/** REFUND_DUE → REFUNDED once staff paid the difference by hand (D5). */
export async function recordCategoryChangeRefund(actor: AuditActor, changeId: string, reference: string) {
  return db.$transaction(async tx => {
    const { change, ctx, who } = await lockChange(tx, changeId);
    const by = actor.name.trim() || actor.email || 'Unknown';
    const claim = await tx.categoryChange.updateMany({
      where: { id: changeId, status: CATEGORY_CHANGE_STATUSES.REFUND_DUE },
      data: {
        status: CATEGORY_CHANGE_STATUSES.REFUNDED,
        refundReference: reference,
        refundedAt: new Date(),
        refundedBy: by,
      },
    });
    if (claim.count === 0) {
      throw new CategoryChangeRefused(409, 'This change has no refund waiting to be recorded. Reload the page.');
    }
    await recordAudit(tx, actor, {
      action: 'category_change.refunded',
      entityType: 'CategoryChange',
      entityId: change.id,
      eventId: ctx.event.id,
      organizerId: ctx.event.organizerId,
      summary: `Recorded the ${peso(change.refundAmount)} refund to ${who} for the category change from ${change.fromCategory.name} to ${change.toCategory.name} (${change.changeRef}, order ${ctx.registration.orderRef}), reference ${reference}.`,
      changes: { status: [change.status, CATEGORY_CHANGE_STATUSES.REFUNDED], refundReference: reference },
    });
    return tx.categoryChange.findUniqueOrThrow({ where: { id: changeId } });
  });
}

/**
 * Staff sent one of a change's emails from their own mailbox: the applied one,
 * or the created one — the payment link and breakdown of an upgrade.
 */
export async function markChangeEmailSentByHand(actor: AuditActor, changeId: string, kind: 'applied' | 'created') {
  return db.$transaction(async tx => {
    const { change, ctx, who } = await lockChange(tx, changeId);
    const updated = await tx.categoryChange.update({
      where: { id: changeId },
      data:
        kind === 'applied'
          ? { appliedEmailSentAt: new Date(), lastEmailError: null }
          : { createdEmailSentAt: new Date(), lastEmailError: null },
    });
    await recordAudit(tx, actor, {
      action: 'category_change.email.sent_by_hand',
      entityType: 'CategoryChange',
      entityId: change.id,
      eventId: ctx.event.id,
      organizerId: ctx.event.organizerId,
      summary: `Marked the category change ${kind === 'created' ? 'payment link ' : ''}email to ${who} as sent by hand (${change.changeRef}, order ${ctx.registration.orderRef}).`,
    });
    return updated;
  });
}

