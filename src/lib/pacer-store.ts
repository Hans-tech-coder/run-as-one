import prisma from '@/lib/db';
import { PACER_DISCOUNT_TYPE } from '@/lib/pacer';

/**
 * Reading pacers out of the database.
 *
 * Kept apart from `pacer.ts` for the reason `promo-store.ts` is kept apart from
 * `discount.ts`: the rules in `pacer.ts` are imported by the Pacers screen,
 * which is a client component, and dragging Prisma into that import would drag
 * it into the browser bundle.
 *
 * Everything here is scoped by `organizerId` **and** `eventId` **and**
 * `discountType`, in the query rather than after it. An id from a URL is not
 * proof of ownership, and the kind belongs in the `where` as much as the owner
 * does — without it these helpers would be a second way to read and count
 * ordinary promotions, one that knows nothing about voucher batches.
 */

/**
 * The columns a pacer row is read with, everywhere this feature reads one.
 *
 * One select rather than one per caller, because the screen, its routes and the
 * event action menu's count all have to be looking at the same pacer: a list
 * that selected `codeSentAt` and a count that did not would disagree about who
 * still needs chasing, which is the one thing `needsCodeSent` exists to settle.
 */
export const PACER_SELECT = {
  id: true,
  code: true,
  assigneeName: true,
  waiveAdminFee: true,
  codeSentAt: true,
  paused: true,
  usageCount: true,
  createdAt: true,
  categories: {
    select: { categoryId: true, category: { select: { id: true, name: true, distance: true } } },
  },
} as const;

/**
 * The half of a `where` that leaves pacer codes out.
 *
 * **A pacer code is not a promotion**, so every screen and query about
 * promotions has to exclude it: `/admin/marketing`'s table and its three metric
 * cards, and `spendByCode` behind *Given Away*. Written once here rather than
 * as a `discountType: { not: 'PACER' }` in each of them, because a place that
 * forgot it would quietly add a pacer's free entry to a campaign's cost and to
 * *Times Redeemed*, where nobody would think to look for it.
 */
export const NOT_A_PACER = { discountType: { not: PACER_DISCOUNT_TYPE } } as const;

/** One event's pacers, oldest first — the order they were added in. */
export async function pacersForEvent(organizerId: string, eventId: string) {
  return prisma.promoCode.findMany({
    where: { organizerId, eventId, discountType: PACER_DISCOUNT_TYPE },
    orderBy: { createdAt: 'asc' },
    select: PACER_SELECT,
  });
}

/**
 * How many pacers of each event still need their code sent, for the events
 * table's action menu.
 *
 * **One query for the whole page**, not one per row: the events table already
 * holds every race the organizer runs, and asking the database once per row to
 * fill in a menu label is how a list of twenty races stops loading.
 *
 * The rule is `needsCodeSent` in `pacer.ts` — no mark **and** not yet
 * registered — expressed here as a `where` so the count comes back already
 * filtered. It is the one place that rule is written twice, and deliberately
 * the narrow half of it: `usageCount` is 0 rather than "unregistered" because a
 * pacer code's limit is 1, so one redemption is the whole of being used.
 */
export async function pacersNeedingCodeSentByEvent(
  organizerId: string,
  eventIds: string[],
): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();

  const rows = await prisma.promoCode.groupBy({
    by: ['eventId'],
    where: {
      organizerId,
      eventId: { in: eventIds },
      discountType: PACER_DISCOUNT_TYPE,
      codeSentAt: null,
      usageCount: 0,
    },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.eventId) counts.set(row.eventId, row._count._all);
  }
  return counts;
}

/**
 * The order each of these pacer codes was used on, keyed by the code text.
 *
 * Attribution is by `Registration.promoCode`, the snapshot string, for exactly
 * the reason `promo-redemptions.ts` gives: the column is deliberately not a
 * relation, so a deleted code cannot rewrite a receipt, and the text is all
 * there is to match on. Scoped to this event as well as to these codes, since
 * the text alone is not proof of anything.
 *
 * This is what turns *Not yet used* into *Registered* with an order reference
 * beside it, and it is why the screen can link a pacer straight to their own row
 * on the registrants list — by `?search=<orderRef>`, which is why the reference
 * is what comes back and not the row's id. The status comes with it because a
 * pacer who still owes the admin fee can be sitting on a PENDING bank transfer,
 * and *Registered* on its own would read as settled.
 */
export async function pacerOrdersByCode(
  eventId: string,
  codes: string[],
): Promise<Map<string, { orderRef: string; status: string }>> {
  if (codes.length === 0) return new Map();

  const rows = await prisma.registration.findMany({
    where: { eventId, promoCode: { in: codes } },
    orderBy: { createdAt: 'asc' },
    select: { orderRef: true, status: true, promoCode: true },
  });

  const orders = new Map<string, { orderRef: string; status: string }>();
  for (const row of rows) {
    // First order wins. A pacer code is single-use, so a second row for one
    // code should not exist — and if one ever does, the earliest is the one the
    // redemption was spent on.
    if (row.promoCode && !orders.has(row.promoCode)) {
      orders.set(row.promoCode, { orderRef: row.orderRef, status: row.status });
    }
  }
  return orders;
}
