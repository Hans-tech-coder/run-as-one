/**
 * **The only writer of a runner refund** (REFUND_PLAN.md): opening one, recording
 * it paid, voiding it. The rule it applies lives in `refund.ts`; this holds the
 * locks and keeps the money row, the runner and the promo in one transaction.
 *
 * **Lock order is event (`FOR SHARE`), then the order (`FOR UPDATE`).** Locking
 * the order is what makes "is this the last runner" and the split safe when two
 * runners of one group are refunded in the same second.
 *
 * **Opening a refund soft-deletes the runner**, and the existing `deletedAt`
 * filters free the slot and the add-on stock, so no count is touched by hand.
 * **A void puts back exactly what opening took** through the same locked counts
 * checkout uses, and is refused when the race has refilled.
 */

import { Prisma } from '@prisma/client';
import prisma from './db';
import type { Actor } from './actor';
import { recordAudit } from './audit';
import { retakeAddOnStock } from './add-on-stock';
import { CATEGORY_CHANGE_STATUSES } from './category-change';
import { LOGISTICS_CHANGE_STATUSES } from './logistics-change';
import { runnerRef } from './order-ref';
import { lockEventRow, reserveSlots } from './registration-gate';
import { formatPesos } from './money';
import {
  MAX_APPROVER_NAME,
  MAX_REFUND_REASON,
  MAX_REFUND_REFERENCE,
  REFUND_PAID_BY_LABELS,
  REFUND_STATUSES,
  asRefundPaidBy,
  isActiveRefund,
  promoHandBackFor,
  promoStillActive,
  quoteRefund,
  readEntryAmount,
  refundBlockedBy,
  refundTotal,
  type RefundPaidBy,
  type RefundQuote,
  type RefundQuoteRunner,
} from './refund';
import { consumeStepUp } from './step-up';
import { isCalendarDay, today } from './event-schedule';
import { MOVED_CHANGE_STATUSES, totalsByEvent } from './settlement-store';

/** Refused with a sentence the screen shows as it is, under `field` when it has one. */
export class RefundRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
  }
}

const STEP_UP_REFUSED = "Confirm it's you again. A refund needs a fresh confirmation.";

/** What a promotion was handed back, so a void can take back exactly that. */
type PromoHandBack = { promoId: string; uses: number; categoryId: string | null };

type Tx = Prisma.TransactionClient;

/**
 * Everyone the order charged for, removed and refunded runners included, since
 * the stored subtotal still counts them (trap 1). The first move of each is read
 * for the category they checked out in.
 */
const PAID_RUNNERS = {
  orderBy: { runnerNo: 'asc' },
  include: {
    category: true,
    addOns: true,
    refund: { select: { status: true } },
    categoryChanges: {
      where: { status: { in: [...MOVED_CHANGE_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      take: 1,
      include: { fromCategory: true },
    },
  },
} satisfies Prisma.Registration$runnersArgs;

const ORDER_READ = {
  event: { select: { id: true, title: true, organizerId: true, shirtSizeUpcharge: true } },
  runners: PAID_RUNNERS,
} satisfies Prisma.RegistrationInclude;

type OrderRead = Prisma.RegistrationGetPayload<{ include: typeof ORDER_READ }>;

function quoteRunners(order: OrderRead): RefundQuoteRunner[] {
  return order.runners.map(runner => {
    const paidCategory = runner.categoryChanges[0]?.fromCategory ?? runner.category;
    return {
      id: runner.id,
      listPrice: paidCategory.price,
      promoPrice: runner.promoPrice,
      category: paidCategory,
      singletSize: runner.singletSize,
      addOns: runner.addOns,
      moved: runner.categoryChanges.length > 0,
    };
  });
}

function quoteOf(order: OrderRead, runnerId: string): RefundQuote | null {
  return quoteRefund(order, quoteRunners(order), runnerId, order.event.shirtSizeUpcharge);
}

/** D9: the refusal for this runner, read on the client given. */
async function blockedBy(
  client: Tx | typeof prisma,
  runnerId: string,
  registrationId: string,
  priceUnclear: boolean,
): Promise<string | null> {
  const [changes, switches] = await Promise.all([
    client.categoryChange.findMany({
      where: {
        runnerId,
        status: {
          in: [
            CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT,
            CATEGORY_CHANGE_STATUSES.APPLIED,
            CATEGORY_CHANGE_STATUSES.REFUND_DUE,
            CATEGORY_CHANGE_STATUSES.REFUNDED,
          ],
        },
      },
      select: { status: true, totalCharged: true, refundAmount: true, difference: true },
    }),
    client.logisticsChangeOrder.count({
      where: { registrationId, change: { status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT } },
    }),
  ]);
  return refundBlockedBy({
    awaitingCategoryChange: changes.some(change => change.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT),
    awaitingDeliverySwitch: switches > 0,
    // Any move that changed the price: the split reads the current category,
    // so it no longer says what this runner paid.
    pricedCategoryChange: changes.some(
      change =>
        change.status !== CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT &&
        (change.totalCharged > 0 || change.refundAmount > 0 || change.difference !== 0),
    ),
    priceUnclear,
  });
}

/** What the modal needs: the figures, the default payer, or why it cannot be done. */
export async function readRefundQuote(runnerId: string) {
  const runner = await prisma.runner.findFirst({
    where: { id: runnerId, deletedAt: null },
    select: { registrationId: true, firstName: true, lastName: true, runnerNo: true },
  });
  if (!runner) return null;
  const order = await prisma.registration.findUnique({ where: { id: runner.registrationId }, include: ORDER_READ });
  if (!order) return null;
  const quote = quoteOf(order, runnerId);
  if (!quote) return null;

  const settlementOf = await totalsByEvent([order.eventId]);
  const { balance } = settlementOf(order.eventId);
  const promoCodes = [order.promoCode, order.combinedPromoCode].filter((code): code is string => Boolean(code));
  const promos = promoCodes.length
    ? await prisma.promoCode.findMany({
        where: { code: { in: promoCodes }, organizerId: order.event.organizerId },
        select: { code: true, paused: true, validFrom: true, validUntil: true },
      })
    : [];
  const now = new Date();
  return {
    quote,
    balance,
    status: order.status,
    orderRef: order.orderRef,
    blocked:
      order.status === 'PAID'
        ? await blockedBy(prisma, runnerId, order.id, quote.priceUnclear)
        : 'Only a paid order can be refunded.',
    promos: promos.map(promo => ({ code: promo.code, returns: promoStillActive(promo, now) })),
  };
}

export type RefundForm = {
  reason: unknown;
  approverName: unknown;
  approvedOn: unknown;
  paidBy: unknown;
  entryAmount: unknown;
};

/** The form's text fields, each refusal under its own field. No proof yet. */
export function readRefundForm(form: RefundForm, now: Date = new Date()): {
  reason: string;
  approverName: string;
  approvedOn: string;
  paidBy: RefundPaidBy;
} {
  const reason = typeof form.reason === 'string' ? form.reason.trim() : '';
  if (!reason) throw new RefundRefused('Say why this runner is being refunded.', 400, 'reason');
  if (reason.length > MAX_REFUND_REASON) {
    throw new RefundRefused(`Keep the reason to ${MAX_REFUND_REASON} characters.`, 400, 'reason');
  }
  const approverName = typeof form.approverName === 'string' ? form.approverName.trim() : '';
  if (!approverName) throw new RefundRefused('Enter who approved this for the organizer.', 400, 'approverName');
  if (approverName.length > MAX_APPROVER_NAME) {
    throw new RefundRefused(`Keep the name to ${MAX_APPROVER_NAME} characters.`, 400, 'approverName');
  }
  const approvedOn = typeof form.approvedOn === 'string' ? form.approvedOn.trim() : '';
  if (!isCalendarDay(approvedOn)) throw new RefundRefused('Enter the day it was approved.', 400, 'approvedOn');
  if (approvedOn > today(now)) throw new RefundRefused('The approval date cannot be in the future.', 400, 'approvedOn');
  const paidBy = asRefundPaidBy(form.paidBy);
  if (!paidBy) throw new RefundRefused('Choose who pays the runner.', 400, 'paidBy');
  return { reason, approverName, approvedOn, paidBy };
}

export function readRefundReference(raw: unknown, required: boolean): string | null {
  const reference = typeof raw === 'string' ? raw.trim() : '';
  if (!reference) {
    if (required) throw new RefundRefused('Enter the GCash or bank reference the refund was sent under.', 400, 'reference');
    return null;
  }
  if (reference.length > MAX_REFUND_REFERENCE) {
    throw new RefundRefused(`Keep the reference to ${MAX_REFUND_REFERENCE} characters.`, 400, 'reference');
  }
  return reference;
}

/** The order read under its lock, so nothing below races another refund. */
async function lockOrder(tx: Tx, registrationId: string, eventId: string): Promise<OrderRead> {
  await lockEventRow(tx, eventId);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Registration" WHERE "id" = ${registrationId} FOR UPDATE`);
  const order = await tx.registration.findUnique({ where: { id: registrationId }, include: ORDER_READ });
  if (!order) throw new RefundRefused('Runner not found', 404);
  return order;
}

/**
 * Hand back what D5 and the kind allow, one promotion at a time, price
 * promotion first then the deal: the order checkout took them in, so the row
 * locks are always taken the same way round.
 */
async function handBackPromos(
  tx: Tx,
  order: OrderRead,
  runner: OrderRead['runners'][number],
  quote: RefundQuote,
  lastRunner: boolean,
  now: Date,
): Promise<PromoHandBack[]> {
  const given: PromoHandBack[] = [];
  const codes: { code: string | null; share: number }[] = [
    { code: order.promoCode, share: quote.discountShare - quote.combinedDiscountShare },
    { code: order.combinedPromoCode, share: quote.combinedDiscountShare },
  ];
  for (const { code, share } of codes) {
    if (!code) continue;
    const promo = await tx.promoCode.findFirst({
      where: { code, organizerId: order.event.organizerId },
      select: { id: true, paused: true, validFrom: true, validUntil: true },
    });
    if (!promo || !promoStillActive(promo, now)) continue;
    const [row] = await tx.$queryRaw<{ usageCount: number; discountType: string }[]>(
      Prisma.sql`SELECT "usageCount", "discountType" FROM "PromoCode" WHERE "id" = ${promo.id} FOR UPDATE`,
    );
    if (!row) continue;
    const back = promoHandBackFor(row.discountType, {
      hasPromoPrice: code === order.promoCode && runner.promoPrice !== null,
      share,
      lastRunner,
    });
    let categoryId: string | null = null;
    if (back.seat) {
      const [seat] = await tx.$queryRaw<{ usageCount: number }[]>(
        Prisma.sql`SELECT "usageCount" FROM "PromoCategoryPrice" WHERE "promoCodeId" = ${promo.id} AND "categoryId" = ${runner.categoryId} FOR UPDATE`,
      );
      // No row: the organizer stopped repricing that category, so no seat to return.
      if (seat && seat.usageCount > 0) {
        await tx.promoCategoryPrice.updateMany({
          where: { promoCodeId: promo.id, categoryId: runner.categoryId },
          data: { usageCount: seat.usageCount - 1 },
        });
        categoryId = runner.categoryId;
      }
    }
    const uses = Math.min(back.uses, row.usageCount);
    if (uses > 0) {
      await tx.promoCode.update({ where: { id: promo.id }, data: { usageCount: row.usageCount - uses } });
    }
    if (uses > 0 || categoryId) given.push({ promoId: promo.id, uses, categoryId });
  }
  return given;
}

/** A void re-spends what opening handed back, never checking the cap: the runner already paid. */
async function retakePromos(tx: Tx, handedBack: PromoHandBack[]): Promise<void> {
  for (const back of handedBack) {
    if (back.categoryId) {
      await tx.promoCategoryPrice.updateMany({
        where: { promoCodeId: back.promoId, categoryId: back.categoryId },
        data: { usageCount: { increment: 1 } },
      });
    }
    if (back.uses > 0) {
      await tx.promoCode.updateMany({ where: { id: back.promoId }, data: { usageCount: { increment: back.uses } } });
    }
  }
}

export type CreateRefundInput = {
  actor: Actor;
  runnerId: string;
  form: RefundForm;
  approvalProof: string;
  stepUpToken: string | undefined;
  expectedStatus: unknown;
};

export async function createRefund(input: CreateRefundInput) {
  const { actor, runnerId, form, approvalProof, stepUpToken, expectedStatus } = input;
  const fields = readRefundForm(form);
  const runnerRow = await prisma.runner.findUnique({
    where: { id: runnerId },
    select: { registrationId: true, registration: { select: { eventId: true } } },
  });
  if (!runnerRow) throw new RefundRefused('Runner not found', 404);

  return prisma.$transaction(async tx => {
    const order = await lockOrder(tx, runnerRow.registrationId, runnerRow.registration.eventId);
    const runner = order.runners.find(r => r.id === runnerId);
    if (!runner || runner.deletedAt) throw new RefundRefused('This runner has already been refunded or removed.', 409);
    if (order.status !== 'PAID') throw new RefundRefused('Only a paid order can be refunded.', 409);
    if (expectedStatus !== undefined && expectedStatus !== order.status) {
      throw new RefundRefused('This order changed while you were refunding. Reload the page to see where it stands.', 409);
    }
    if (!(await consumeStepUp(stepUpToken, { actor, action: 'runner.refund', targetId: runnerId }, tx))) {
      throw new RefundRefused(STEP_UP_REFUSED, 403);
    }
    const quote = quoteOf(order, runnerId);
    if (!quote) throw new RefundRefused('Runner not found', 404);
    const blocked = await blockedBy(tx, runnerId, order.id, quote.priceUnclear);
    if (blocked) throw new RefundRefused(blocked, 409);
    const entry = readEntryAmount(form.entryAmount, quote);
    if (entry.value === null) throw new RefundRefused(entry.error ?? 'Check the amount.', 400, 'entryAmount');

    const now = new Date();
    const liveRunners = order.runners.filter(r => !r.deletedAt).length;
    const handedBack = await handBackPromos(tx, order, runner, quote, liveRunners === 1, now);
    const amount = refundTotal(entry.value, quote);

    const data = {
      eventId: order.eventId,
      registrationId: order.id,
      entryAmount: entry.value,
      suggestedAmount: quote.suggestedAmount,
      discountShare: quote.discountShare,
      combinedDiscountShare: quote.combinedDiscountShare,
      addOnOrganizerAmount: quote.addOnOrganizerAmount,
      addOnRunAsOneAmount: quote.addOnRunAsOneAmount,
      amount,
      status: REFUND_STATUSES.REFUND_DUE,
      paidBy: fields.paidBy,
      reason: fields.reason,
      approverName: fields.approverName,
      approvedOn: fields.approvedOn,
      approvalProof,
      promoHandBack: handedBack.length > 0 ? handedBack : Prisma.JsonNull,
      createdBy: actor.name.trim() || actor.email,
    };
    // A voided refund is written over (one row per runner); the trail keeps it.
    const refund = await tx.runnerRefund.upsert({
      where: { runnerId },
      create: { ...data, runnerId },
      update: {
        ...data,
        createdAt: now,
        paymentReference: null,
        paymentProof: null,
        refundedAt: null,
        refundedBy: null,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      },
    });
    await tx.runner.update({ where: { id: runnerId }, data: { deletedAt: now, deletedById: actor.id } });

    const ref = runnerRef(order.orderRef, runner.runnerNo, order.runners.length);
    await recordAudit(tx, actor, {
      action: 'runner_refund.created',
      entityType: 'RunnerRefund',
      entityId: refund.id,
      eventId: order.eventId,
      organizerId: order.event.organizerId,
      summary: `Opened a ₱${formatPesos(amount)} refund for ${runner.firstName} ${runner.lastName} (${ref}), paid by ${
        REFUND_PAID_BY_LABELS[fields.paidBy]
      }. Reason: ${fields.reason.replace(/[.!?]+$/, '')}. Approved by ${fields.approverName} on ${fields.approvedOn}.`,
      changes: {
        amount,
        entryAmount: entry.value,
        suggestedAmount: quote.suggestedAmount,
        paidBy: fields.paidBy,
        reason: fields.reason,
        approverName: fields.approverName,
        approvedOn: fields.approvedOn,
        promoHandedBack: handedBack.length,
      },
    });
    return refund;
  });
}

/** REFUND_DUE → REFUNDED. Returns what the email needs. */
export async function recordRefund(
  actor: Actor,
  refundId: string,
  reference: string | null,
  proof: string | null,
) {
  return prisma.$transaction(async tx => {
    const existing = await tx.runnerRefund.findUnique({ where: { id: refundId }, select: { registrationId: true, eventId: true } });
    if (!existing) throw new RefundRefused('Refund not found', 404);
    const order = await lockOrder(tx, existing.registrationId, existing.eventId);
    const refund = await tx.runnerRefund.findUnique({ where: { id: refundId }, include: { runner: true } });
    if (!refund) throw new RefundRefused('Refund not found', 404);
    if (refund.status !== REFUND_STATUSES.REFUND_DUE) {
      throw new RefundRefused('This refund is no longer waiting to be paid. Reload the page to see where it stands.', 409);
    }
    const updated = await tx.runnerRefund.update({
      where: { id: refundId },
      data: {
        status: REFUND_STATUSES.REFUNDED,
        paymentReference: reference,
        paymentProof: proof,
        refundedAt: new Date(),
        refundedBy: actor.name.trim() || actor.email,
      },
    });
    await recordAudit(tx, actor, {
      action: 'runner_refund.recorded',
      entityType: 'RunnerRefund',
      entityId: refundId,
      eventId: refund.eventId,
      organizerId: order.event.organizerId,
      summary: `Recorded the ₱${formatPesos(refund.amount)} refund to ${refund.runner.firstName} ${refund.runner.lastName} as paid${
        reference ? ` (ref ${reference})` : ''
      }.`,
      changes: { status: [REFUND_STATUSES.REFUND_DUE, REFUND_STATUSES.REFUNDED], reference, proof: Boolean(proof) },
    });
    return { refund: updated, runner: refund.runner, order };
  });
}

/** REFUND_DUE → VOIDED: the runner comes back, or nothing changes. */
export async function voidRefund(actor: Actor, refundId: string, rawReason: unknown) {
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (!reason) throw new RefundRefused('Say why this refund is being voided.', 400, 'reason');
  if (reason.length > MAX_REFUND_REASON) throw new RefundRefused(`Keep the reason to ${MAX_REFUND_REASON} characters.`, 400, 'reason');

  return prisma.$transaction(async tx => {
    const existing = await tx.runnerRefund.findUnique({ where: { id: refundId }, select: { registrationId: true, eventId: true } });
    if (!existing) throw new RefundRefused('Refund not found', 404);
    const order = await lockOrder(tx, existing.registrationId, existing.eventId);
    const refund = await tx.runnerRefund.findUnique({ where: { id: refundId }, include: { runner: true } });
    if (!refund) throw new RefundRefused('Refund not found', 404);
    if (refund.status !== REFUND_STATUSES.REFUND_DUE) {
      throw new RefundRefused('Only a refund not yet paid can be voided.', 409);
    }
    const categories = await tx.category.findMany({
      where: { eventId: refund.eventId },
      select: { id: true, name: true, slotLimit: true },
    });
    // allowClosed: this runner was already in the option when it closed.
    await reserveSlots(tx, categories, [{ categoryId: refund.runner.categoryId }], { allowClosed: true });
    await retakeAddOnStock(tx, refund.registrationId, { runnerId: refund.runnerId });
    await retakePromos(tx, (refund.promoHandBack as PromoHandBack[] | null) ?? []);

    await tx.runner.update({ where: { id: refund.runnerId }, data: { deletedAt: null, deletedById: null } });
    const updated = await tx.runnerRefund.update({
      where: { id: refundId },
      data: {
        status: REFUND_STATUSES.VOIDED,
        voidedAt: new Date(),
        voidedBy: actor.name.trim() || actor.email,
        voidReason: reason,
      },
    });
    await recordAudit(tx, actor, {
      action: 'runner_refund.voided',
      entityType: 'RunnerRefund',
      entityId: refundId,
      eventId: refund.eventId,
      organizerId: order.event.organizerId,
      summary: `Voided the ₱${formatPesos(refund.amount)} refund to ${refund.runner.firstName} ${refund.runner.lastName}, who is back on the race. Reason: ${reason.replace(/[.!?]+$/, '')}.`,
      changes: { status: [REFUND_STATUSES.REFUND_DUE, REFUND_STATUSES.VOIDED], reason },
    });
    return updated;
  });
}

/** One event's refunds, newest first, for the Refunds list. */
export async function refundsForEvent(eventId: string) {
  const rows = await prisma.runnerRefund.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    include: {
      runner: { select: { firstName: true, lastName: true, runnerNo: true } },
      registration: { select: { orderRef: true, _count: { select: { runners: true } } } },
    },
  });
  return rows.map(row => ({
    id: row.id,
    name: `${row.runner.firstName} ${row.runner.lastName}`,
    ref: runnerRef(row.registration.orderRef, row.runner.runnerNo, row.registration._count.runners),
    amount: row.amount,
    /** What it could have been: the split's entry plus their add-ons. */
    of: row.suggestedAmount + row.addOnOrganizerAmount + row.addOnRunAsOneAmount,
    kept: row.suggestedAmount - row.entryAmount,
    status: row.status,
    paidBy: row.paidBy,
    reason: row.reason,
    approverName: row.approverName,
    approvedOn: row.approvedOn,
    paymentReference: row.paymentReference,
    hasPaymentProof: Boolean(row.paymentProof),
    active: isActiveRefund(row.status),
    createdAtIso: row.createdAt.toISOString(),
  }));
}

export type RefundRow = Awaited<ReturnType<typeof refundsForEvent>>[number];
