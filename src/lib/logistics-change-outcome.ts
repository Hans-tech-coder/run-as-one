import 'server-only';
import db from '@/lib/db';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { paymentMethodLabel } from '@/lib/registration-codes';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';
import { LogisticsChangeRefused, eligibilityFor, lockSwitch, SWITCH_EVENT_SELECT } from '@/lib/logistics-change-context';
import { refsOf } from '@/lib/logistics-change-parcels';
import { switchAwaitsAddress } from '@/lib/logistics-change-proof';
import { by, moveOrder, peso } from '@/lib/logistics-change-store';

/**
 * **How a waiting delivery switch ends** (LOGISTICS_CHANGE_PLAN.md Session 2,
 * Session 3): applied once its fee is paid, or withdrawn by staff. Split out
 * of `logistics-change-store.ts`, which opens switches, under the same locks
 * (`lockSwitch`) and the same claim on `AWAITING_PAYMENT`, so a payment and a
 * cancel never both win. A switch still waiting for the runner's address
 * (Revision 3b) has nothing to apply and is refused here.
 */

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
      summary: `Cancelled the switch to delivery for order${orders.length === 1 ? '' : 's'} ${refsOf(orders.map(o => o.orderRef))} (${change.changeRef}).`,
      changes: { status: [LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT, LOGISTICS_CHANGE_STATUSES.CANCELLED] },
    });
    return change;
  });
}


/** How the fee came in, written on the switch as it applies. */
export type AppliedSwitchPayment = {
  paymentMethod?: string;
  transactionNumber?: string | null;
  proofOfPayment?: string | null;
  transactionFee?: number;
  totalCharged?: number;
};

/**
 * Applies a switch whose fee was paid: PayMongo's webhook, the runner back
 * from PayMongo, or a payment staff recorded (lib/logistics-change-payment.ts).
 * Takes the same locks a new switch does and re-checks under them, so a
 * payment never moves an order somewhere a new switch could not go now:
 *
 * - the switch is still waiting (a claim on its status, so two payments for
 *   one switch apply it once);
 * - the order is still PAID and still on pickup, and the race still allows
 *   switching (L3, L11): **after the deadline nothing applies**, because the
 *   courier's lead time is what the deadline protects. A lapsed hold that the
 *   sweep has not closed yet is not refused: there is no seat to lose, and the
 *   money is in.
 *
 * The fee is the one quoted when the switch was opened: the runner pays what
 * the link showed. A refusal rolls everything back and is the caller's to
 * report as a late payment.
 */
export async function applyLogisticsChange(actor: AuditActor, changeId: string, payment: AppliedSwitchPayment = {}) {
  const found = await db.logisticsChange.findUnique({
    where: { id: changeId },
    select: { eventId: true, orders: { select: { registrationId: true } } },
  });
  if (!found) throw new LogisticsChangeRefused(404, 'Delivery switch not found');

  return db.$transaction(async tx => {
    await lockSwitch(tx, found.eventId, found.orders.map(link => link.registrationId));
    const now = new Date();
    const claim = await tx.logisticsChange.updateMany({
      where: { id: changeId, status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT },
      data: { ...payment, status: LOGISTICS_CHANGE_STATUSES.APPLIED, appliedAt: now },
    });
    if (claim.count === 0) {
      throw new LogisticsChangeRefused(409, 'This switch is no longer waiting for payment. Reload the page.');
    }
    const change = await tx.logisticsChange.findUniqueOrThrow({
      where: { id: changeId },
      include: {
        event: { select: SWITCH_EVENT_SELECT },
        orders: { select: { registration: { select: { id: true, orderRef: true, status: true, logisticsMethod: true } } } },
      },
    });

    // Revision 3b: a switch still waiting for the runner's address has nowhere to ship.
    if (switchAwaitsAddress({ ...change, status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT })) {
      throw new LogisticsChangeRefused(409, "The runner has not confirmed the delivery address yet, so there is nothing to apply. It waits on the link.");
    }
    const orders = change.orders.map(link => link.registration);
    for (const order of orders) {
      // The open switch is this one, so it is not counted against itself (L13).
      const eligibility = eligibilityFor(change.event, order, false, now);
      if (!eligibility.allowed) {
        throw new LogisticsChangeRefused(409, `Order ${order.orderRef}: ${eligibility.message}`);
      }
      if (eligibility.direction !== change.direction) {
        throw new LogisticsChangeRefused(409, `Order ${order.orderRef} is no longer on pickup, so it cannot be switched.`);
      }
    }
    for (const order of orders) await moveOrder(tx, order.id, change);

    const how = [
      change.paymentMethod ? ` by ${paymentMethodLabel(change.paymentMethod)}` : '',
      change.transactionNumber ? `, reference ${change.transactionNumber}` : '',
    ].join('');
    await recordAudit(tx, actor, {
      action: 'logistics_change.applied',
      entityType: 'LogisticsChange',
      entityId: change.id,
      eventId: change.eventId,
      organizerId: change.event.organizerId,
      summary: `Switched order${orders.length === 1 ? '' : 's'} ${refsOf(orders.map(o => o.orderRef))} from pickup to delivery to ${change.deliverySplit ? "each runner's home address" : (change.deliveryAddress ?? 'the address given')} (${change.changeRef}): ${peso(change.totalCharged)} paid${how}.`,
      changes: {
        orders: refsOf(orders.map(o => o.orderRef)),
        status: [LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT, LOGISTICS_CHANGE_STATUSES.APPLIED],
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
