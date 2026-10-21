import 'server-only';
import db from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { holdLapsed } from '@/lib/category-change-hold';
import { LOGISTICS_CHANGE_STATUSES, logisticsChangeDeadline } from '@/lib/logistics-change';
import { retireSwitchPage } from '@/lib/logistics-change-payment';
import { refsOf } from '@/lib/logistics-change-parcels';
import { switchHoldUntil } from '@/lib/logistics-change-proof';

/**
 * **When an unpaid delivery switch lapses** (LOGISTICS_CHANGE_PLAN.md L12;
 * Session 3), modelled on `category-change-expiry.ts` and run by the same daily
 * sweep (`expiry-sweep.ts`), so one trigger tidies orders, upgrades and
 * switches alike.
 *
 * An awaiting switch expires at its `holdUntil` — 24 hours from opening for an
 * online payment, 7 days for GCash or bank, capped at the switch deadline when
 * it was opened — **or at the event's switch deadline, read now**, because an
 * organizer can bring the deadline forward after a switch was opened (L11).
 *
 * A GCash or bank switch whose proof the runner submitted on its link waits
 * past its hold for staff to check it (Revision 3 T6): only the deadline
 * expires it.
 *
 * There is no seat to release: the order never moved, so it stays on pickup.
 * The sweep makes the status say so, writes the trail row, and closes the switch's
 * PayMongo page. A payment that lands anyway is caught as late
 * (`settleSwitchOnline`). Nobody is emailed, as for an upgrade.
 *
 * Claimed with a conditional write, so a payment landing at the same moment
 * either applies first and is left alone, or finds the switch expired.
 */

/** The most switches one sweep expires, as `MAX_SWEEP` caps orders. */
const MAX_SWITCH_SWEEP = 200;

export async function expireLogisticsChanges(now: Date = new Date()): Promise<{ expired: number; changeRefs: string[] }> {
  // Judged here rather than in the query: the deadline is per event and may
  // be null (seven days before race day), and open switches are few — one per
  // receipt at most (L13).
  const open = await db.logisticsChange.findMany({
    where: { status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      changeRef: true,
      holdUntil: true,
      paymentMethod: true,
      proofOfPayment: true,
      status: true,
      checkoutSessionId: true,
      eventId: true,
      event: { select: { organizerId: true, date: true, logisticsChangeUntil: true } },
      orders: { select: { registration: { select: { orderRef: true } } } },
    },
  });

  const due = open
    .filter(change => {
      const deadline = logisticsChangeDeadline(change.event);
      // No readable deadline is read as closed, as `logisticsChangeDeadline` says.
      return holdLapsed(switchHoldUntil(change), now) || deadline === null || deadline.getTime() <= now.getTime();
    })
    .slice(0, MAX_SWITCH_SWEEP);

  const changeRefs: string[] = [];
  for (const change of due) {
    const orders = refsOf(change.orders.map(link => link.registration.orderRef));
    const claimed = await db.$transaction(async tx => {
      const claim = await tx.logisticsChange.updateMany({
        where: { id: change.id, status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT },
        data: { status: LOGISTICS_CHANGE_STATUSES.EXPIRED, expiredAt: now },
      });
      if (claim.count === 0) return false;
      await recordAudit(
        tx,
        { kind: 'SYSTEM', id: null, orgId: change.event.organizerId, name: 'Expiry sweep', email: null },
        {
          action: 'logistics_change.expired',
          entityType: 'LogisticsChange',
          entityId: change.id,
          eventId: change.eventId,
          organizerId: change.event.organizerId,
          summary: `The switch to delivery for order ${orders} (${change.changeRef}) expired unpaid; the kits stay on pickup.`,
          changes: { status: [LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT, LOGISTICS_CHANGE_STATUSES.EXPIRED] },
        },
      );
      return true;
    });
    if (!claimed) continue;
    changeRefs.push(change.changeRef);
    await retireSwitchPage(change);
  }
  return { expired: changeRefs.length, changeRefs };
}
