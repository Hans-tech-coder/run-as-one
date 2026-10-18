import 'server-only';
import db from '@/lib/db';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { formatPesos } from '@/lib/money';
import { LOGISTICS_METHODS, paymentMethodLabel } from '@/lib/registration-codes';
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
 * (LOGISTICS_CHANGE_PLAN.md L2–L13; Session 2).
 *
 * The rule this owns: an order's `logisticsMethod`, `deliveryZone`,
 * `deliveryAddress` and `deliverySplit` move only here, and only together with
 * the `LogisticsChange` row that explains it and a `LogisticsChangeOrder` link
 * that remembers what each order was before. Its `deliveryFee`, `totalAmount`
 * and every other amount are never touched (L4): the receipt stays what was
 * paid, and the switch's money lives on its own row.
 *
 * Every write takes `lockSwitch` (event, the event's switches, each order in
 * id order) and then re-reads and re-checks under it: eligibility (L3, L11,
 * L13), which orders may join (L6: the customer's other paid pickup orders),
 * that a reverse takes its riders with it (L10), and the fee, recomputed by
 * `quoteLogisticsChange` from what the database holds now. Nothing posted is
 * trusted as a figure.
 *
 * A switch with nothing to pay — back to pickup (L9), or every parcel riding on
 * one already paid (L6) — applies in the same transaction. One with a fee is
 * written AWAITING_PAYMENT with its hold (`changeHoldUntil`, never past the
 * deadline, L12) and moves nothing yet; paying it is Session 3, and until then
 * staff can cancel it.
 */

function peso(centavos: number): string {
  return `₱${formatPesos(centavos)}`;
}

function by(actor: AuditActor): string {
  return actor.name.trim() || actor.email || 'Unknown';
}

/** "RM-A1" or "RM-A1, RM-B2 and RM-C3". */
function refsOf(orders: readonly { orderRef: string }[]): string {
  const refs = orders.map(order => order.orderRef);
  return refs.length === 1 ? refs[0] : `${refs.slice(0, -1).join(', ')} and ${refs.at(-1)}`;
}

/** Where a switch to delivery ships, in the trail's words. */
function whereTo(quote: Extract<LogisticsQuote, { ok: true }>): string {
  if (quote.deliverySplit) return "each runner's home address";
  return quote.deliveryAddress ?? 'the address given';
}

export type CreateSwitchInput = {
  registrationId: string;
  /** Other orders ticked into the switch: the customer's pickup orders (L6), or riders going back (L10). */
  includeIds?: readonly string[];
  /** Where TO_DELIVERY ships. Ignored for TO_PICKUP. */
  target?: { deliveryAddress?: string | null; deliveryZone?: unknown; deliverySplit?: boolean };
  /** How a fee will be paid, stored form, from `paymentMethodForChoice`. Required when there is a fee. */
  paymentMethod?: string | null;
  reason?: string | null;
};

/**
 * Starts a switch. With nothing to pay it is applied in the same transaction;
 * with a fee it waits for payment and nothing moves.
 */
export async function createLogisticsChange(actor: AuditActor, input: CreateSwitchInput) {
  const includeIds = [...new Set(input.includeIds ?? [])].filter(id => id !== input.registrationId);
  const where = await db.registration.findUnique({ where: { id: input.registrationId }, select: { eventId: true } });
  if (!where) throw new LogisticsChangeRefused(404, 'Order not found');

  return db.$transaction(async tx => {
    await lockSwitch(tx, where.eventId, [input.registrationId, ...includeIds]);
    const now = new Date();
    const ctx = await readSwitchContext(tx, input.registrationId, now);
    if (!ctx.eligibility.allowed) throw new LogisticsChangeRefused(409, ctx.eligibility.message);

    // Only the orders the modal could offer may join: the customer's other
    // paid pickup orders going to delivery, the riders going back to pickup.
    const offered = ctx.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY ? ctx.candidates : ctx.riders;
    const included: SwitchOrderRow[] = includeIds.map(id => {
      const order = offered.find(o => o.id === id);
      if (!order) {
        throw new LogisticsChangeRefused(
          409,
          'One of the ticked orders can no longer join this switch. Close the window and open it again.',
        );
      }
      return order;
    });
    const orders = [ctx.order, ...included];

    // L10: a parcel others ride on at ₱0 goes back only with its riders.
    if (ctx.direction === LOGISTICS_DIRECTIONS.TO_PICKUP) {
      const left = await ctx.ridersOutside(orders.map(order => order.id));
      if (left.length > 0) {
        const refs = await tx.registration.findMany({ where: { id: { in: left } }, select: { orderRef: true } });
        throw new LogisticsChangeRefused(
          409,
          `${refsOf(refs)} ${refs.length === 1 ? 'ships' : 'ship'} with this order at no charge, so this order cannot go back to pickup alone. Tick ${refs.length === 1 ? 'it' : 'them'} to switch together.`,
        );
      }
    }

    const method = input.paymentMethod ?? null;
    const quote = quoteLogisticsChange({
      event: ctx.event,
      direction: ctx.direction,
      orders: orders.map(asSwitchOrder),
      target: input.target,
      existing: ctx.existing,
      paymentMethod: method,
    });
    if (!quote.ok) throw new LogisticsChangeRefused(400, quote.message);

    const awaiting = quote.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
    if (awaiting) {
      if (!method) throw new LogisticsChangeRefused(400, `Choose how the runner pays the ${peso(quote.fee)}.`);
      // Paid the way the entry was paid (category-change-hold.ts).
      if (!paymentChoicesForOrder(ctx.order.paymentMethod).some(c => paymentMethodForChoice(c) === method)) {
        const paid = paymentMethodLabel(ctx.order.paymentMethod);
        throw new LogisticsChangeRefused(
          400,
          `This order was paid ${paid === 'Online' ? 'online' : `by ${paid}`}; the delivery fee is paid the same way.`,
        );
      }
    }
    const holdUntil = awaiting ? changeHoldUntil(method, now, logisticsChangeDeadline(ctx.event)) : null;
    const ridesOn = quote.ridesOnRegistrationId
      ? ctx.existing.find(paid => paid.registrationId === quote.ridesOnRegistrationId)
      : null;
    const ridesOnRef = ridesOn
      ? (await tx.registration.findUniqueOrThrow({ where: { id: ridesOn.registrationId }, select: { orderRef: true } }))
          .orderRef
      : null;

    const change = await tx.logisticsChange.create({
      data: {
        changeRef: logisticsChangeRef(ctx.order.orderRef, ctx.changeNo),
        eventId: ctx.event.id,
        direction: quote.direction,
        deliveryZone: quote.deliveryZone,
        deliveryAddress: quote.deliveryAddress,
        deliverySplit: quote.deliverySplit,
        ridesOnRegistrationId: quote.ridesOnRegistrationId,
        fee: quote.fee,
        transactionFee: quote.transactionFee,
        totalCharged: quote.totalCharged,
        status: quote.status,
        paymentMethod: awaiting ? method : null,
        holdUntil,
        reason: input.reason?.trim() || null,
        createdBy: by(actor),
        // One instant for both, so a switch applied at once never reads as
        // applied before it was made.
        createdAt: now,
        appliedAt: awaiting ? null : now,
        orders: {
          create: orders.map(order => ({
            registrationId: order.id,
            fromLogisticsMethod: order.logisticsMethod,
            fromDeliveryZone: order.deliveryZone,
            fromDeliveryAddress: order.deliveryAddress,
            fromDeliverySplit: order.deliverySplit,
          })),
        },
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
      orders: orders.map(order => order.orderRef).join(', '),
      direction: quote.direction,
      fee: quote.fee,
      ...(toDelivery
        ? { deliverySplit: quote.deliverySplit, deliveryAddress: quote.deliverySplit ? null : quote.deliveryAddress }
        : {}),
      ...(ridesOnRef ? { ridesOn: ridesOnRef } : {}),
    };
    const which = `order${orders.length === 1 ? '' : 's'} ${refsOf(orders)}`;

    if (awaiting) {
      await recordAudit(tx, actor, {
        ...trail,
        action: 'logistics_change.created',
        summary: `Opened a switch to delivery for ${which} to ${whereTo(quote)} (${change.changeRef}): ${peso(quote.totalCharged)} to pay by ${paymentMethodLabel(method)}.`,
        changes: { ...changes, paymentMethod: method, holdUntil: holdUntil?.toISOString() ?? null },
      });
      return change;
    }

    // L4: the logistics move and nothing else; the receipt's amounts stay.
    await tx.registration.updateMany({
      where: { id: { in: orders.map(order => order.id) } },
      data: toDelivery
        ? {
            logisticsMethod: LOGISTICS_METHODS.DELIVERY,
            deliveryZone: quote.deliveryZone,
            deliveryAddress: quote.deliveryAddress,
            deliverySplit: quote.deliverySplit,
          }
        : { logisticsMethod: LOGISTICS_METHODS.PICKUP, deliveryZone: null, deliveryAddress: null, deliverySplit: false },
    });
    await recordAudit(tx, actor, {
      ...trail,
      action: 'logistics_change.applied',
      summary: toDelivery
        ? `Switched ${which} from pickup to delivery to ${whereTo(quote)} (${change.changeRef}): ships with ${ridesOnRef ?? 'a paid parcel'}, nothing to pay.`
        : `Switched ${which} from delivery to pickup (${change.changeRef}): nothing refunded.`,
      changes: { ...changes, status: change.status },
    });
    return change;
  });
}

/**
 * Withdraws a switch still waiting for its fee. Its orders never moved, so
 * nothing else changes; there is no seat to release.
 */
export async function cancelLogisticsChange(actor: AuditActor, changeId: string) {
  const found = await db.logisticsChange.findUnique({
    where: { id: changeId },
    select: { eventId: true, orders: { select: { registrationId: true } } },
  });
  if (!found) throw new LogisticsChangeRefused(404, 'Delivery switch not found');

  return db.$transaction(async tx => {
    await lockSwitch(tx, found.eventId, found.orders.map(link => link.registrationId));
    const claim = await tx.logisticsChange.updateMany({
      where: { id: changeId, status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT },
      data: { status: LOGISTICS_CHANGE_STATUSES.CANCELLED, cancelledAt: new Date(), cancelledBy: by(actor) },
    });
    if (claim.count === 0) {
      throw new LogisticsChangeRefused(409, 'Only a switch waiting for payment can be cancelled. Reload the page.');
    }
    const change = await tx.logisticsChange.findUniqueOrThrow({
      where: { id: changeId },
      include: {
        event: { select: { organizerId: true } },
        orders: { select: { registration: { select: { orderRef: true } } } },
      },
    });
    const orders = change.orders.map(link => link.registration);
    await recordAudit(tx, actor, {
      action: 'logistics_change.cancelled',
      entityType: 'LogisticsChange',
      entityId: change.id,
      eventId: change.eventId,
      organizerId: change.event.organizerId,
      summary: `Cancelled the switch to delivery for order${orders.length === 1 ? '' : 's'} ${refsOf(orders)} (${change.changeRef}).`,
      changes: { status: [LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT, LOGISTICS_CHANGE_STATUSES.CANCELLED] },
    });
    return change;
  });
}

