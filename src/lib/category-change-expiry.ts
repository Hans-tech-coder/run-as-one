import 'server-only';
import db from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { CATEGORY_CHANGE_STATUSES, categoryChangeDeadline } from '@/lib/category-change';
import { holdLapsed } from '@/lib/category-change-hold';
import { retireChangePage } from '@/lib/category-change-payment';

/**
 * **When an unpaid upgrade lets go of its seat** (CATEGORY_CHANGE_PLAN.md D11,
 * D12; Session 3). Run by the daily abandoned-checkout sweep
 * (`runExpirySweep` in expiry-sweep.ts), so the one trigger that tidies
 * orders tidies changes too, and no second schedule can disagree.
 *
 * An awaiting change expires at its `holdUntil` — 24 hours from opening for an
 * online payment, 7 days for GCash or bank, both capped at the change deadline
 * when it was opened (`category-change-hold.ts`) — **or at the event's change
 * deadline, read now**, because an organizer can bring the deadline forward
 * after a change was opened, and every open change closes with it (D12).
 *
 * The seat needs no action: `slot-holds.ts` stopped counting a lapsed hold the
 * moment it lapsed, and EXPIRED is not counted at all. The sweep only makes the
 * status say so, writes the trail row, and closes the change's PayMongo page so
 * its link stops taking money. A payment that lands anyway is caught as late
 * (`settleChangeOnline`). The runner stays in their old category and is not
 * emailed, for the reason the order sweep gives: Resend's daily quota is not
 * spent on telling someone a thing they walked away from was tidied up.
 *
 * Claimed with a conditional write, so a payment landing at the same moment
 * either applies first and is left alone, or finds the change expired.
 */

/** The most changes one sweep expires, as `MAX_SWEEP` caps orders. */
const MAX_CHANGE_SWEEP = 200;

export async function expireCategoryChanges(now: Date = new Date()): Promise<{ expired: number; changeRefs: string[] }> {
  // Every open change is read and judged here rather than in the query: the
  // deadline is per event and may be null (the day before race day), and open
  // changes are few — one per runner at most (D10).
  const open = await db.categoryChange.findMany({
    where: { status: CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      changeRef: true,
      holdUntil: true,
      checkoutSessionId: true,
      eventId: true,
      event: { select: { organizerId: true, date: true, categoryChangeUntil: true } },
      registration: { select: { orderRef: true } },
      fromCategory: { select: { name: true } },
      toCategory: { select: { name: true } },
    },
  });

  const due = open
    .filter(change => {
      const deadline = categoryChangeDeadline(change.event);
      // No readable deadline is read as closed, as `categoryChangeDeadline` says.
      return holdLapsed(change.holdUntil, now) || deadline === null || deadline.getTime() <= now.getTime();
    })
    .slice(0, MAX_CHANGE_SWEEP);

  const changeRefs: string[] = [];
  for (const change of due) {
    const claimed = await db.$transaction(async tx => {
      const claim = await tx.categoryChange.updateMany({
        where: { id: change.id, status: CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT },
        data: { status: CATEGORY_CHANGE_STATUSES.EXPIRED, expiredAt: now },
      });
      if (claim.count === 0) return false;
      await recordAudit(
        tx,
        { kind: 'SYSTEM', id: null, orgId: change.event.organizerId, name: 'Expiry sweep', email: null },
        {
          action: 'category_change.expired',
          entityType: 'CategoryChange',
          entityId: change.id,
          eventId: change.eventId,
          organizerId: change.event.organizerId,
          summary: `The category change from ${change.fromCategory.name} to ${change.toCategory.name} (${change.changeRef}, order ${change.registration.orderRef}) expired unpaid; its held seat in ${change.toCategory.name} was released.`,
          changes: { status: [CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT, CATEGORY_CHANGE_STATUSES.EXPIRED] },
        },
      );
      return true;
    });
    if (!claimed) continue;
    changeRefs.push(change.changeRef);
    await retireChangePage(change);
  }
  return { expired: changeRefs.length, changeRefs };
}
