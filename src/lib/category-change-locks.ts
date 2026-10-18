import 'server-only';
import { Prisma } from '@prisma/client';
import { lockEventRow } from '@/lib/registration-gate';
import { takenSlotsByCategory } from '@/lib/slot-holds';
import {
  CategoryChangeRefused,
  readRunnerContext,
  type CategoryRow,
  type RunnerContext,
} from '@/lib/category-change-context';

/**
 * **The locks every category change write takes, in the one order they are
 * taken** (CATEGORY_CHANGE_PLAN.md D10, D11).
 *
 * The event row `FOR SHARE` (`lockEventRow`, the half of the checkout lock that
 * does not ask whether sign-ups are open — a paused or closed race still lets
 * staff switch a runner already in it, and still lets a runner's payment for an
 * upgrade land), then the runner row `FOR UPDATE`, which serialises two staff
 * members, or a staff member and a webhook, working the same runner, then the
 * target category `FOR UPDATE` before its seats are counted, as `reserveSlots`
 * does. Checkout takes event then category, so the order never inverts and
 * nothing deadlocks.
 *
 * Split out of `category-change-store.ts` when the upgrade's payment writes
 * (`category-change-payment.ts`) needed the same locks. Server-only.
 */

/**
 * A seat in the target option, counted under its row lock (D11), as
 * `reserveSlots` counts for checkout — worded for staff rather than for a
 * runner at step 1 of the wizard. The runner still stands in their old option,
 * so the count does not include them and one free seat is enough.
 *
 * Also asked when an upgrade's own hold has lapsed before its payment landed:
 * the lapsed hold no longer counts, so the seat is taken only if one is free.
 */
export async function claimSeat(tx: Prisma.TransactionClient, to: Pick<CategoryRow, 'id' | 'name' | 'slotLimit'>) {
  if (!to.slotLimit || to.slotLimit <= 0) return;
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Category" WHERE "id" = ${to.id} FOR UPDATE`);
  const taken = (await takenSlotsByCategory([to.id], tx)).get(to.id) ?? 0;
  if (taken >= to.slotLimit) {
    throw new CategoryChangeRefused(
      409,
      `${to.name} is full (${taken} of ${to.slotLimit} slots taken), so nobody can move into it. Pick another category, or raise its slot limit first.`,
    );
  }
}

/** The event row locked, the runner row locked, and the runner read under both. */
export async function lockRunner(tx: Prisma.TransactionClient, runnerId: string): Promise<RunnerContext> {
  const where = await tx.runner.findUnique({
    where: { id: runnerId },
    select: { registration: { select: { eventId: true } } },
  });
  if (!where) throw new CategoryChangeRefused(404, 'Runner not found');
  const event = await lockEventRow(tx, where.registration.eventId);
  if (!event) throw new CategoryChangeRefused(404, 'Runner not found');
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Runner" WHERE "id" = ${runnerId} FOR UPDATE`);
  const ctx = await readRunnerContext(tx, runnerId);
  if (!ctx || ctx.runner.deletedAt) throw new CategoryChangeRefused(404, 'Runner not found');
  return ctx;
}

/** Loads a change's runner and locks it, for the writes that start from a change id. */
export async function lockChange(tx: Prisma.TransactionClient, changeId: string) {
  const change = await tx.categoryChange.findUnique({
    where: { id: changeId },
    include: { fromCategory: { select: { name: true } }, toCategory: { select: { name: true } } },
  });
  if (!change) throw new CategoryChangeRefused(404, 'Category change not found');
  const ctx = await lockRunner(tx, change.runnerId);
  return { change, ctx, who: `${ctx.runner.firstName} ${ctx.runner.lastName}` };
}
