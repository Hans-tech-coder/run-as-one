import 'server-only';
import db from '@/lib/db';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { deletePrivateFile } from '@/lib/blob';
import { formatPesos } from '@/lib/money';
import { changePayableState, isOutsidePayment } from '@/lib/category-change-hold';
import {
  LOGISTICS_CHANGE_STATUSES,
  LOGISTICS_DIRECTIONS,
  logisticsChangeDeadline,
  quoteLogisticsChange,
} from '@/lib/logistics-change';
import {
  LogisticsChangeRefused,
  asSwitchOrder,
  eligibilityFor,
  lockSwitch,
  readSwitchContext,
} from '@/lib/logistics-change-context';
import { waitingConflict, waitingRefusal } from '@/lib/logistics-change-parcels';
import { switchAwaitsAddress, switchHoldUntil, switchProofSubmitted } from '@/lib/logistics-change-proof';
import { moveOrder } from '@/lib/logistics-change-store';
import { deliverSwitchEmail, readSwitchForPayment, receiptOf, settleSwitchOnline } from '@/lib/logistics-change-payment';
import { logisticsChangeProofReceivedEmail, sendLogisticsChangeEmail } from '@/lib/email-logistics-change';
import { lookUpPaymongoPayment } from '@/lib/online-payment';
import { retirePaymongoPage } from '@/lib/paymongo-session';

/**
 * **What the runner may do on a delivery switch's link** (LOGISTICS_CHANGE_PLAN.md
 * Revision 3, T2–T7): confirm or change where the kits ship and who receives
 * them, and, on a GCash or bank switch, hand in the payment's screenshot and
 * reference. The page is `/pay/logistics/[token]`; the routes are
 * `api/logistics-change/details` and `api/logistics-change/proof`, which trust
 * nothing but the signed token.
 *
 * **Changing the address re-quotes it under the switch locks** (T2), by the
 * same rules a new switch is opened by (`logistics-change-store.ts`): the
 * order still allowed to switch, R4 (an address already waiting on another
 * receipt's fee) and L6 (an address already receiving a paid parcel rides on
 * it at ₱0). A ₱0 ride applies here and sends the *switched* email; any other
 * fee is written over the switch's figures. The hold never moves.
 *
 * **An open PayMongo page is closed first** (T3), as the checkout route closes
 * one before opening the next: asked whether it was paid (then the switch is
 * settled from that payment and the edit refused), closed, and the claim
 * written only if the switch still points at that page.
 *
 * **Proof** (T5, T7) lands on the switch's own `proofOfPayment` and
 * `transactionNumber` while it waits, replacing an earlier one, whose file is
 * deleted. Staff apply it with *Record payment*; nothing applies here. Once the
 * proof is in, the details are read-only (T3) and the hold no longer closes
 * the switch (T6, `logistics-change-proof.ts`).
 */

/** Who the trail names for what the runner did on the link: the order's contact. */
function runnerActor(organizerId: string, order: { customerName: string; customerEmail: string }): AuditActor {
  return {
    kind: 'SYSTEM',
    id: null,
    orgId: organizerId,
    name: `${order.customerName.trim() || 'The runner'} (on the switch's link)`,
    email: order.customerEmail,
  };
}

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

export type ConfirmedDetails = { outcome: 'saved' | 'applied'; fee: number; totalCharged: number };

/**
 * The runner confirmed where the kits ship (T2, T3). `target` is the composed
 * `deliveryAddress` and, when the event's province is unknown, the zone the
 * runner picked, exactly what *Ship kits* posts.
 */
export async function confirmSwitchDetails(
  changeId: string,
  target: { deliveryAddress?: string | null; deliveryZone?: unknown },
): Promise<ConfirmedDetails> {
  const found = await readSwitchForPayment(changeId);
  if (!found) throw new LogisticsChangeRefused(404, 'This link is not valid any more.');
  const order = receiptOf(found);

  // T3: a page opened before the edit is asked, then closed, so it cannot
  // charge the old fee.
  const openPage = found.checkoutSessionId;
  if (openPage) {
    const lookup = await lookUpPaymongoPayment(openPage);
    if ('paid' in lookup && lookup.paid) {
      await settleSwitchOnline(changeId);
      throw new LogisticsChangeRefused(
        409,
        'This delivery was already paid, so its address can no longer change here. Reply to our email if it must.',
      );
    }
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (secretKey) {
      const retired = await retirePaymongoPage(secretKey, openPage);
      if (!retired.ok) {
        throw new LogisticsChangeRefused(
          409,
          'A payment may be under way on the payment page you opened. Wait a few minutes, then open this link again.',
        );
      }
    }
  }

  const result = await db.$transaction(async tx => {
    await lockSwitch(tx, found.eventId, [order.id]);
    const now = new Date();
    const change = await tx.logisticsChange.findUniqueOrThrow({ where: { id: changeId } });
    const ctx = await readSwitchContext(tx, order.id, now);

    if (changePayableState({ status: change.status, holdUntil: switchHoldUntil(change) }, logisticsChangeDeadline(ctx.event), now) !== 'payable') {
      throw new LogisticsChangeRefused(409, 'This switch is no longer waiting for payment. Reload the page.');
    }
    if (switchProofSubmitted(change)) {
      throw new LogisticsChangeRefused(
        409,
        'Your payment proof is in, so the delivery details can no longer change here. Reply to our email if they must.',
      );
    }
    if (change.checkoutSessionId !== openPage) {
      throw new LogisticsChangeRefused(409, 'This switch moved while you were editing. Reload the page and try again.');
    }
    // The open switch is this one, so it is not counted against itself (L13).
    const eligibility = eligibilityFor(ctx.event, ctx.order, false, now);
    if (!eligibility.allowed) throw new LogisticsChangeRefused(409, eligibility.message);
    if (eligibility.direction !== LOGISTICS_DIRECTIONS.TO_DELIVERY) {
      throw new LogisticsChangeRefused(409, 'These kits are no longer on pickup, so this switch cannot change.');
    }

    const quote = quoteLogisticsChange({
      event: ctx.event,
      direction: LOGISTICS_DIRECTIONS.TO_DELIVERY,
      orders: [asSwitchOrder(ctx.order)],
      target,
      existing: ctx.existing,
      paymentMethod: change.paymentMethod,
    });
    if (!quote.ok) throw new LogisticsChangeRefused(400, quote.message);
    // R4: never a second fee waiting for one parcel.
    const blocking = waitingConflict(quote.parcels, ctx.waiting, order.id);
    if (blocking) throw new LogisticsChangeRefused(409, waitingRefusal(blocking));

    const ridesFree = quote.status === LOGISTICS_CHANGE_STATUSES.APPLIED;
    const claim = await tx.logisticsChange.updateMany({
      where: { id: changeId, status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT, checkoutSessionId: openPage },
      data: {
        deliveryZone: quote.deliveryZone,
        deliveryAddress: quote.deliveryAddress,
        deliverySplit: false,
        ridesOnRegistrationId: quote.ridesOnRegistrationId,
        fee: quote.fee,
        transactionFee: quote.transactionFee,
        totalCharged: quote.totalCharged,
        checkoutSessionId: null,
        ...(ridesFree ? { status: LOGISTICS_CHANGE_STATUSES.APPLIED, appliedAt: now } : {}),
      },
    });
    if (claim.count === 0) {
      throw new LogisticsChangeRefused(409, 'This switch moved while you were editing. Reload the page and try again.');
    }

    const actor = runnerActor(ctx.event.organizerId, order);
    const trail = {
      entityType: 'LogisticsChange' as const,
      entityId: changeId,
      eventId: ctx.event.id,
      organizerId: ctx.event.organizerId,
    };
    const changes = {
      orders: order.orderRef,
      deliveryAddress: [change.deliveryAddress, quote.deliveryAddress] as [string | null, string | null],
      fee: [change.fee, quote.fee] as [number, number],
    };

    if (ridesFree) {
      await moveOrder(tx, order.id, quote);
      const host = ctx.existing.find(paid => paid.registrationId === quote.ridesOnRegistrationId);
      await recordAudit(tx, actor, {
        ...trail,
        action: 'logistics_change.applied',
        summary: `The runner confirmed delivery for order ${order.orderRef} to ${quote.deliveryAddress} (${change.changeRef}): ships with ${host?.orderRef ?? 'a paid parcel'}, nothing to pay.`,
        changes: { ...changes, status: [change.status, LOGISTICS_CHANGE_STATUSES.APPLIED], ...(host ? { ridesOn: host.orderRef } : {}) },
      });
    } else {
      await recordAudit(tx, actor, {
        ...trail,
        action: 'logistics_change.details_confirmed',
        summary: `The runner confirmed the delivery details for order ${order.orderRef} (${change.changeRef}): to ${quote.deliveryAddress}, ${peso(quote.totalCharged)} to pay${!change.deliveryAddress ? ' (the first address given)' : change.fee !== quote.fee ? ` (was ${peso(change.totalCharged)})` : ''}.`,
        changes,
      });
    }
    return { outcome: ridesFree ? ('applied' as const) : ('saved' as const), fee: quote.fee, totalCharged: quote.totalCharged };
  });

  if (result.outcome === 'applied') {
    await deliverSwitchEmail(changeId, 'applied').catch(error => console.error('Delivery switch email failed:', error));
  }
  return result;
}

/**
 * The runner handed in the GCash or bank payment's screenshot and reference
 * (T5, T7). The upload is the caller's (`uploadPrivateProof`, before this, so
 * a refusal here leaves the caller to delete it). An earlier proof is replaced
 * and its file deleted after the write. Emails the runner that it arrived (T8).
 */
export async function submitSwitchProof(
  changeId: string,
  proof: { transactionNumber: string; proofPathname: string },
): Promise<void> {
  const found = await readSwitchForPayment(changeId);
  if (!found) throw new LogisticsChangeRefused(404, 'This link is not valid any more.');
  const order = receiptOf(found);
  if (!isOutsidePayment(found.paymentMethod)) {
    throw new LogisticsChangeRefused(409, 'This delivery is paid online. Reload the page and press Pay now.');
  }
  if (switchAwaitsAddress(found)) {
    throw new LogisticsChangeRefused(409, 'Confirm the delivery address first. Reload the page.');
  }

  const replaced = await db.$transaction(async tx => {
    await lockSwitch(tx, found.eventId, [order.id]);
    const now = new Date();
    const change = await tx.logisticsChange.findUniqueOrThrow({
      where: { id: changeId },
      select: { status: true, paymentMethod: true, proofOfPayment: true, holdUntil: true, changeRef: true, transactionNumber: true },
    });
    if (changePayableState({ status: change.status, holdUntil: switchHoldUntil(change) }, logisticsChangeDeadline(found.event), now) !== 'payable') {
      throw new LogisticsChangeRefused(409, 'This switch is no longer waiting for payment. Reload the page.');
    }
    const claim = await tx.logisticsChange.updateMany({
      where: { id: changeId, status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT, proofOfPayment: change.proofOfPayment },
      data: { proofOfPayment: proof.proofPathname, transactionNumber: proof.transactionNumber },
    });
    if (claim.count === 0) throw new LogisticsChangeRefused(409, 'This switch moved just now. Reload the page and try again.');
    await recordAudit(tx, runnerActor(found.event.organizerId, order), {
      action: 'logistics_change.proof_submitted',
      entityType: 'LogisticsChange',
      entityId: changeId,
      eventId: found.eventId,
      organizerId: found.event.organizerId,
      summary: `The runner ${change.proofOfPayment ? 'replaced' : 'submitted'} the GCash or bank proof for order ${order.orderRef} (${change.changeRef}), reference ${proof.transactionNumber}. Check it, then record the payment.`,
      changes: {
        transactionNumber: [change.transactionNumber, proof.transactionNumber] as [string | null, string],
        proofOfPayment: change.proofOfPayment ? 'replaced' : 'attached',
      },
    });
    return change.proofOfPayment;
  });

  if (replaced) {
    await deletePrivateFile(replaced).catch(error => console.error('Delivery switch: the replaced proof could not be deleted', error));
  }
  const message = await logisticsChangeProofReceivedEmail({
    changeRef: found.changeRef,
    totalCharged: found.totalCharged,
    transactionNumber: proof.transactionNumber,
    order: { orderRef: order.orderRef, customerName: order.customerName, customerEmail: order.customerEmail },
    event: { title: found.event.title },
  });
  const outcome = await sendLogisticsChangeEmail(message).catch(error => ({ sent: false as const, error: String(error) }));
  if (!outcome.sent) console.error(`Delivery switch ${found.changeRef}: the proof-received email was not sent`, outcome.error);
}
