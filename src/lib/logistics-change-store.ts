import 'server-only';
import type { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { formatPesos } from '@/lib/money';
import { LOGISTICS_METHODS, PAYMENT_METHODS, paymentMethodLabel } from '@/lib/registration-codes';
import { changeHoldUntil, paymentChoicesForOrder, paymentMethodForChoice } from '@/lib/category-change-hold';
import {
  LOGISTICS_CHANGE_STATUSES,
  LOGISTICS_DIRECTIONS,
  logisticsChangeDeadline,
  logisticsChangeRef,
  quoteLogisticsChange,
  type LogisticsQuote,
} from '@/lib/logistics-change';
import {
  LogisticsChangeRefused,
  asSwitchOrder,
  lockSwitch,
  readSwitchContext,
  type SwitchOrderRow,
} from '@/lib/logistics-change-context';

/**
 * **The only writer of an order's pickup or delivery after checkout**
 * (LOGISTICS_CHANGE_PLAN.md L2–L13, Revision 1 R3).
 *
 * The rule this owns: an order's `logisticsMethod`, `deliveryZone`,
 * `deliveryAddress` and `deliverySplit` move only here, and only together with
 * the `LogisticsChange` row that explains it and a `LogisticsChangeOrder` link
 * that remembers what the order was before. Its `deliveryFee`, `totalAmount`
 * and every other amount are never touched (L4): the receipt stays what was
 * paid, and the switch's money lives on its own row.
 *
 * **One receipt per switch, one fee per receipt** (R3, and the owner on
 * 2026-10-21: "kung magkaibang transaction or reference order, separate ang
 * bayad sa delivery fee"). Kits of two receipts going to one address are two
 * parcels and pay twice; only the runners of one group registration share a
 * parcel, because the switch moves the whole order (L2). No receipt rides on
 * another's paid parcel, none is refused for another's waiting one, and any
 * receipt may go back to pickup on its own (this replaced L6, R4 and R5).
 *
 * Every write takes `lockSwitch` (event, the event's switches, the order) and
 * then re-reads and re-checks under it: eligibility (L3, L11, L13) and the
 * fee, recomputed by `quoteLogisticsChange` from what the database holds now.
 * Nothing posted is trusted as a figure.
 *
 * Back to pickup (L9), the one switch with nothing to pay, applies in the
 * same transaction; every delivered tier costs more than ₱0. One with a fee is
 * written AWAITING_PAYMENT with its hold (`changeHoldUntil`, never past the
 * deadline, L12) and moves nothing yet. `applyLogisticsChange` moves it once
 * the fee is paid (Session 3, lib/logistics-change-payment.ts), or staff
 * cancel it; both live in `logistics-change-outcome.ts`. A fee the runner **already paid** by GCash or bank (the owner's
 * addition to Session 4) is written applied in the same transaction, with its
 * reference and proof, so the runner is never asked to pay what they paid.
 */

export function peso(centavos: number): string {
  return `₱${formatPesos(centavos)}`;
}

export function by(actor: AuditActor): string {
  return actor.name.trim() || actor.email || 'Unknown';
}

/** Where a switch to delivery ships, in the trail's words. */
function whereTo(quote: Extract<LogisticsQuote, { ok: true }>): string {
  if (quote.deliverySplit) return "each runner's home address";
  return quote.deliveryAddress ?? 'the address given';
}

type Target = {
  direction: string;
  deliveryZone: string | null;
  deliveryAddress: string | null;
  deliverySplit: boolean;
};

/**
 * L4: the order's logistics move and nothing else; the receipt's amounts stay.
 * The one place an order's method is written after checkout, for a switch
 * applied at once, one applied when its fee is paid, and one the runner
 * confirmed onto a paid parcel on its link (`logistics-change-runner.ts`).
 */
export async function moveOrder(tx: Prisma.TransactionClient, registrationId: string, target: Target) {
  await tx.registration.updateMany({
    where: { id: registrationId },
    data:
      target.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY
        ? {
            logisticsMethod: LOGISTICS_METHODS.DELIVERY,
            deliveryZone: target.deliveryZone,
            deliveryAddress: target.deliveryAddress,
            deliverySplit: target.deliverySplit,
          }
        : { logisticsMethod: LOGISTICS_METHODS.PICKUP, deliveryZone: null, deliveryAddress: null, deliverySplit: false },
  });
}

/** The order a switch moves, with what it was before (the history's *from*). */
function orderLink(order: SwitchOrderRow) {
  return {
    registrationId: order.id,
    fromLogisticsMethod: order.logisticsMethod,
    fromDeliveryZone: order.deliveryZone,
    fromDeliveryAddress: order.deliveryAddress,
    fromDeliverySplit: order.deliverySplit,
  };
}

/** A fee to come is paid the way the entry was paid (category-change-hold.ts); refused otherwise. */
function requireOrderMethod(orderMethod: string | null, method: string | null, what: string): asserts method is string {
  if (!method) throw new LogisticsChangeRefused(400, `Choose how the runner pays ${what}.`);
  if (!paymentChoicesForOrder(orderMethod).some(choice => paymentMethodForChoice(choice) === method)) {
    const entry = paymentMethodLabel(orderMethod);
    throw new LogisticsChangeRefused(
      400,
      `This order was paid ${entry === 'Online' ? 'online' : `by ${entry}`}; the delivery fee is paid the same way.`,
    );
  }
}

export type CreateSwitchInput = {
  registrationId: string;
  /** Where TO_DELIVERY ships. Ignored for TO_PICKUP. */
  target?: { deliveryAddress?: string | null; deliveryZone?: unknown };
  /** How a fee will be paid, stored form, from `paymentMethodForChoice`. Required when there is a fee. */
  paymentMethod?: string | null;
  reason?: string | null;
  /**
   * *Already paid* (the owner's addition to Session 4): the runner sent the fee
   * by GCash or bank before staff opened the switch. It is written applied in
   * the same transaction, with the money on the row as `recordSwitchPayment`
   * writes it, and no *payment needed* email is owed. The proof is already in
   * the private store; the caller deletes it if this throws.
   */
  paidOutside?: { transactionNumber: string; proofPathname: string | null } | null;
};

/**
 * Starts a switch. With nothing to pay it is applied in the same transaction;
 * with a fee it waits for payment and nothing moves.
 */
export async function createLogisticsChange(actor: AuditActor, input: CreateSwitchInput) {
  const where = await db.registration.findUnique({ where: { id: input.registrationId }, select: { eventId: true } });
  if (!where) throw new LogisticsChangeRefused(404, 'Order not found');

  return db.$transaction(async tx => {
    await lockSwitch(tx, where.eventId, [input.registrationId]);
    const now = new Date();
    const ctx = await readSwitchContext(tx, input.registrationId, now);
    if (!ctx.eligibility.allowed) throw new LogisticsChangeRefused(409, ctx.eligibility.message);
    const order = ctx.order;

    const method = input.paymentMethod ?? null;

    // Revision 3b (T12): no address yet. The runner gives it on the switch's
    // link, where the fee is quoted (`confirmSwitchDetails`);
    // until then the switch waits with no address and no fee.
    if (ctx.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY && !input.paidOutside && !input.target?.deliveryAddress?.trim()) {
      requireOrderMethod(order.paymentMethod, method, 'the delivery fee');
      const holdUntil = changeHoldUntil(method, now, logisticsChangeDeadline(ctx.event));
      const change = await tx.logisticsChange.create({
        data: {
          changeRef: logisticsChangeRef(order.orderRef, ctx.changeNo),
          eventId: ctx.event.id,
          direction: LOGISTICS_DIRECTIONS.TO_DELIVERY,
          status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT,
          paymentMethod: method,
          holdUntil,
          reason: input.reason?.trim() || null,
          createdBy: by(actor),
          createdAt: now,
          orders: { create: orderLink(order) },
        },
      });
      await recordAudit(tx, actor, {
        action: 'logistics_change.created',
        entityType: 'LogisticsChange',
        entityId: change.id,
        eventId: ctx.event.id,
        organizerId: ctx.event.organizerId,
        summary: `Opened a switch to delivery for order ${order.orderRef} (${change.changeRef}): the runner gives the address on the link, then pays its fee by ${paymentMethodLabel(method)}.`,
        changes: {
          orders: order.orderRef,
          direction: LOGISTICS_DIRECTIONS.TO_DELIVERY,
          addressPending: true,
          paymentMethod: method,
          holdUntil: holdUntil.toISOString(),
        },
      });
      return change;
    }

    const quote = quoteLogisticsChange({
      event: ctx.event,
      direction: ctx.direction,
      orders: [asSwitchOrder(order)],
      target: input.target,
      paymentMethod: method,
    });
    if (!quote.ok) throw new LogisticsChangeRefused(400, quote.message);

    const hasFee = quote.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
    // Every delivered tier has a fee; refused rather than moved free should that change.
    if (quote.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY && !hasFee) {
      throw new LogisticsChangeRefused(409, "Delivery to this address has no fee set. Check the race's delivery fees.");
    }
    const paid = input.paidOutside ?? null;
    if (paid && !hasFee) {
      // Back to pickup, so there is nothing to record; refused, so the payment is not kept as if owed.
      throw new LogisticsChangeRefused(
        409,
        'This switch has nothing to pay now, so there is no payment to record. Reload the page and switch it again.',
      );
    }
    // Already paid is applied below; only a fee still to come waits.
    const awaiting = hasFee && !paid;
    if (awaiting) requireOrderMethod(order.paymentMethod, method, peso(quote.fee));
    const holdUntil = awaiting ? changeHoldUntil(method, now, logisticsChangeDeadline(ctx.event)) : null;

    const change = await tx.logisticsChange.create({
      data: {
        changeRef: logisticsChangeRef(order.orderRef, ctx.changeNo),
        eventId: ctx.event.id,
        direction: quote.direction,
        deliveryZone: quote.deliveryZone,
        deliveryAddress: quote.deliveryAddress,
        deliverySplit: quote.deliverySplit,
        fee: quote.fee,
        // Already paid: the money as it really came in, the way
        // `recordSwitchPayment` writes it (a bank transfer carries no PayMongo cut).
        transactionFee: paid ? 0 : quote.transactionFee,
        totalCharged: paid ? quote.fee : quote.totalCharged,
        status: paid ? LOGISTICS_CHANGE_STATUSES.APPLIED : quote.status,
        paymentMethod: paid ? PAYMENT_METHODS.BANK_TRANSFER : awaiting ? method : null,
        transactionNumber: paid?.transactionNumber ?? null,
        proofOfPayment: paid?.proofPathname ?? null,
        holdUntil,
        reason: input.reason?.trim() || null,
        createdBy: by(actor),
        // One instant for both, so a switch applied at once never reads as
        // applied before it was made.
        createdAt: now,
        appliedAt: awaiting ? null : now,
        // One link: one receipt per switch (R3). The link table stays, so the
        // history reads the same for switches made before Revision 1.
        orders: { create: orderLink(order) },
      },
    });

    const toDelivery = quote.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY;
    const trail = {
      entityType: 'LogisticsChange' as const,
      entityId: change.id,
      eventId: ctx.event.id,
      organizerId: ctx.event.organizerId,
    };
    const changes = {
      // The key Session 2's rows used for several, kept so the trail reads one way.
      orders: order.orderRef,
      direction: quote.direction,
      fee: quote.fee,
      ...(toDelivery
        ? { deliverySplit: quote.deliverySplit, deliveryAddress: quote.deliverySplit ? null : quote.deliveryAddress }
        : {}),
    };
    const which = `order ${order.orderRef}`;

    if (awaiting) {
      await recordAudit(tx, actor, {
        ...trail,
        action: 'logistics_change.created',
        summary: `Opened a switch to delivery for ${which} to ${whereTo(quote)} (${change.changeRef}): ${peso(quote.totalCharged)} to pay by ${paymentMethodLabel(method)}.`,
        changes: { ...changes, paymentMethod: method, holdUntil: holdUntil?.toISOString() ?? null },
      });
      return change;
    }

    await moveOrder(tx, order.id, quote);
    if (paid) {
      // One row, applied: the payment was recorded as the switch was made, and
      // the trail says so, since no *created* row comes before it.
      await recordAudit(tx, actor, {
        ...trail,
        action: 'logistics_change.applied',
        summary: `Switched ${which} from pickup to delivery to ${whereTo(quote)} (${change.changeRef}): ${peso(change.totalCharged)} already paid by ${paymentMethodLabel(change.paymentMethod)}, reference ${paid.transactionNumber}, recorded as the switch was made.`,
        changes: {
          ...changes,
          status: change.status,
          recordedAtCreation: true,
          paymentMethod: change.paymentMethod,
          totalCharged: change.totalCharged,
          transactionFee: change.transactionFee,
          transactionNumber: paid.transactionNumber,
          ...(paid.proofPathname ? { proofOfPayment: 'attached' } : {}),
        },
      });
      return change;
    }
    await recordAudit(tx, actor, {
      ...trail,
      action: 'logistics_change.applied',
      summary: `Switched ${which} from delivery to pickup (${change.changeRef}): nothing refunded.`,
      changes: { ...changes, status: change.status },
    });
    return change;
  });
}
