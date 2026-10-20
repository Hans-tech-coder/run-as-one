import type { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { CATEGORY_CHANGE_STATUSES } from '@/lib/category-change';
import { changeHeldUntil, holdLapsed } from '@/lib/category-change-hold';

/**
 * **What holds a seat in a category, and how many each category has taken.**
 *
 * Two things hold one: a runner on a live order, and an upgrade waiting for its
 * payment (CATEGORY_CHANGE_PLAN.md D11). The second holds a seat in the
 * category the runner is moving *to*, while the runner still holds their old
 * one, because a runner must not pay for a seat that filled while they were
 * paying. Counting it here, in the one function every reader of slots goes
 * through, is what makes the event page, both wizards, the listings and both
 * checkout routes see it without each learning about category changes.
 *
 * Split out of `registration-gate.ts`, which still re-exports both names, when
 * the held seats arrived: that file decides whether an event is taking
 * sign-ups, and this one only counts.
 */

/**
 * Which registrations hold a slot.
 *
 * PENDING counts. Counting only PAID would oversell every event that takes
 * bank transfers: those sit PENDING from the moment they are submitted until a
 * human has looked at the proof, which can be days. Selling that seat twice in
 * the meantime is exactly the failure a slot limit exists to prevent.
 */
export const SLOT_HOLDING_STATUSES = ['PAID', 'PENDING'] as const;

/** A Prisma client or transaction handle with the two models counted here. */
type SlotCountClient = Pick<Prisma.TransactionClient, 'runner' | 'categoryChange'>;

/**
 * How many runners each of these categories has already taken.
 *
 * Grouped in one query rather than counted per category: an event page asking
 * five separate counts would be five round trips to Neon for a number that is
 * read on every page load.
 *
 * `client` is the transaction handle when a checkout route calls this, and the
 * plain client everywhere else. The count has to be taken *inside* the write
 * transaction to mean anything there, and the arithmetic must not fork into a
 * second copy for that.
 *
 * **Awaiting upgrades are read without the clock in the query** and their hold
 * judged here. The public pages count through `publicDb`, whose cache key is
 * the query's arguments: `holdUntil > now` would make a new key every request.
 * The rows are few — one per runner at most (D10), and only while a payment is
 * outstanding — so filtering them in memory costs nothing. A hold past its time
 * stops counting the moment it lapses, before the sweep marks it EXPIRED.
 */
export async function takenSlotsByCategory(
  categoryIds: string[],
  client: SlotCountClient = db,
  now: Date = new Date(),
): Promise<Map<string, number>> {
  if (categoryIds.length === 0) return new Map();

  const [rows, held] = await Promise.all([
    client.runner.groupBy({
      by: ['categoryId'],
      where: {
        categoryId: { in: categoryIds },
        // A runner an organizer removed holds no slot, exactly as it held none
        // when removal was a hard delete — the row now stays for the trail.
        deletedAt: null,
        registration: { status: { in: [...SLOT_HOLDING_STATUSES] } },
      },
      _count: { _all: true },
    }),
    client.categoryChange.findMany({
      where: {
        toCategoryId: { in: categoryIds },
        status: CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT,
      },
      select: { toCategoryId: true, holdUntil: true, status: true, paymentMethod: true, proofOfPayment: true },
    }),
  ]);

  const taken = new Map<string, number>(rows.map(row => [row.categoryId, row._count._all]));
  for (const change of held) {
    // No hold time is read as holding: an awaiting change without one is a
    // row nobody bounded, and counting it is the side that cannot oversell.
    // One whose runner sent proof holds past its time (`changeHeldUntil`).
    if (holdLapsed(changeHeldUntil(change), now)) continue;
    taken.set(change.toCategoryId, (taken.get(change.toCategoryId) ?? 0) + 1);
  }
  return taken;
}
