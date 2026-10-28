import 'server-only';
import { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { takenSlotsByCategory } from '@/lib/slot-holds';
import { runnerRef } from '@/lib/order-ref';
import { paymentChoicesForOrder } from '@/lib/category-change-hold';
import {
  CATEGORY_CHANGE_STATUSES,
  canChangeCategory,
  categoryChangeDeadline,
  quoteCategoryChange,
  type CategoryChangeQuote,
  type ChangeEligibility,
} from '@/lib/category-change';

/**
 * **What a category change is decided from: one runner read the same way by
 * the modal's preview and by every write** (CATEGORY_CHANGE_PLAN.md D3, D9–D12).
 *
 * `readRunnerContext` is the one read — the runner, the order's money, the
 * event's change settings and options, an open change, how many changes came
 * before, and whether a race result exists — and `eligibilityFor` / `quoteFor`
 * turn it into the answer and the figures. The preview calls them on the plain
 * client; `category-change-store.ts` calls them inside its transaction, after
 * its locks, so the figure it writes is computed from what is locked.
 *
 * Split out of the store, which owns the writes, to keep each under the size
 * the repository splits files at. Server-only.
 */

/** Thrown with the sentence staff should read and the status the route answers with. */
export class CategoryChangeRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CategoryChangeRefused';
  }
}

const CATEGORY_SELECT = {
  id: true,
  name: true,
  distance: true,
  price: true,
  inclusions: true,
  slotLimit: true,
} as const;

/** Everything the quote, the eligibility check and the modal read about one runner. */
export async function readRunnerContext(client: Prisma.TransactionClient | typeof db, runnerId: string) {
  const runner = await client.runner.findUnique({
    where: { id: runnerId },
    include: {
      category: { select: CATEGORY_SELECT },
      registration: {
        select: {
          id: true,
          orderRef: true,
          status: true,
          discountAmount: true,
          discountType: true,
          totalAmount: true,
          addOnTotal: true,
          transactionFee: true,
          promoCode: true,
          paymentMethod: true,
          eventId: true,
          event: {
            select: {
              id: true,
              title: true,
              organizerId: true,
              date: true,
              resultsOnly: true,
              categoryChangeUntil: true,
              categoryChangeFee: true,
              downgradeRefundPolicy: true,
              categories: { select: CATEGORY_SELECT, orderBy: { sortOrder: 'asc' } },
            },
          },
          // Removed runners included: an order-level discount was spread over
          // everyone the order was priced for (QuoteInput.order.runnerCount).
          _count: { select: { runners: true } },
        },
      },
    },
  });
  if (!runner) return null;

  const eventId = runner.registration.eventId;
  const [liveRunners, openChange, changeCount, result] = await Promise.all([
    client.runner.count({ where: { registrationId: runner.registrationId, deletedAt: null } }),
    client.categoryChange.findFirst({
      where: { runnerId, status: CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT },
      select: { id: true, changeRef: true },
    }),
    client.categoryChange.count({ where: { runnerId } }),
    // A result has no link to its runner — it is keyed by bib, which a runner
    // row does not carry — so the name is the match (Session 1's note). A
    // false match only refuses a change staff can still make by fixing the
    // name; a missed one lets through a change the deadline almost always
    // closed already, since results arrive after race day.
    client.raceResult.findFirst({
      where: {
        eventId,
        name: { equals: `${runner.firstName} ${runner.lastName}`.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    }),
  ]);

  return {
    runner,
    registration: runner.registration,
    event: runner.registration.event,
    runnerRef: runnerRef(runner.registration.orderRef, runner.runnerNo, liveRunners),
    runnerCount: runner.registration._count.runners,
    openChange,
    changeCount,
    hasRaceResult: result !== null,
  };
}

export type RunnerContext = NonNullable<Awaited<ReturnType<typeof readRunnerContext>>>;
export type CategoryRow = RunnerContext['event']['categories'][number];

export function eligibilityFor(ctx: RunnerContext, toCategoryId?: string, now = new Date()): ChangeEligibility {
  if (ctx.event.resultsOnly) {
    return {
      allowed: false,
      reason: 'PAST_DEADLINE',
      message: 'This race only shows results, so its runners cannot change category.',
    };
  }
  return canChangeCategory({
    orderStatus: ctx.registration.status,
    runnerRemoved: ctx.runner.deletedAt !== null,
    hasOpenChange: ctx.openChange !== null,
    hasRaceResult: ctx.hasRaceResult,
    event: ctx.event,
    fromCategoryId: ctx.runner.categoryId,
    toCategoryId,
    now,
  });
}

export function quoteFor(
  ctx: RunnerContext,
  to: CategoryRow,
  basisAdjustment: { basis: number; reason: string } | null,
  /** How an upgrade will be paid, stored form; sets its transaction fee (D13). */
  paymentMethod: string | null = null,
): CategoryChangeQuote {
  return quoteCategoryChange({
    fromPrice: ctx.runner.category.price,
    toPrice: to.price,
    promoPrice: ctx.runner.promoPrice,
    order: {
      discountAmount: ctx.registration.discountAmount,
      discountType: ctx.registration.discountType,
      totalAmount: ctx.registration.totalAmount,
      addOnTotal: ctx.registration.addOnTotal,
      transactionFee: ctx.registration.transactionFee,
      runnerCount: ctx.runnerCount,
    },
    event: {
      categoryChangeFee: ctx.event.categoryChangeFee,
      downgradeRefundPolicy: ctx.event.downgradeRefundPolicy,
    },
    basisAdjustment,
    paymentMethod,
  });
}

/** Who may act on this runner: the route checks `can()` against it before anything else. */
export async function findChangeReach(runnerId: string) {
  const runner = await db.runner.findFirst({
    where: { id: runnerId, deletedAt: null },
    select: { registration: { select: { eventId: true, event: { select: { organizerId: true } } } } },
  });
  return runner
    ? { organizerId: runner.registration.event.organizerId, eventId: runner.registration.eventId }
    : null;
}

/** Who may act on a change: the route checks `can()` against it before anything else. */
export async function findChangeReachById(changeId: string) {
  const change = await db.categoryChange.findUnique({
    where: { id: changeId },
    select: { eventId: true, event: { select: { organizerId: true } } },
  });
  return change ? { organizerId: change.event.organizerId, eventId: change.eventId } : null;
}

/**
 * The modal's opening read: the runner, the order's money, the event's change
 * settings, every option with its seats, and whether a change may be made at
 * all. The quote itself is computed in the browser from these with the same
 * `quoteCategoryChange`; `toCategoryId`, when given, adds the server's own.
 * Writes nothing.
 */
export async function previewCategoryChange(input: {
  runnerId: string;
  toCategoryId?: string | null;
  basisAdjustment?: { basis: number; reason: string } | null;
}) {
  const ctx = await readRunnerContext(db, input.runnerId);
  if (!ctx || ctx.runner.deletedAt) throw new CategoryChangeRefused(404, 'Runner not found');

  const taken = await takenSlotsByCategory(ctx.event.categories.map(c => c.id));
  const to = input.toCategoryId
    ? ctx.event.categories.find(c => c.id === input.toCategoryId) ?? null
    : null;
  const deadline = categoryChangeDeadline(ctx.event);

  return {
    eligibility: eligibilityFor(ctx, to?.id),
    runner: {
      id: ctx.runner.id,
      name: `${ctx.runner.firstName} ${ctx.runner.lastName}`,
      runnerRef: ctx.runnerRef,
      categoryId: ctx.runner.categoryId,
      promoPrice: ctx.runner.promoPrice,
    },
    order: {
      orderRef: ctx.registration.orderRef,
      status: ctx.registration.status,
      totalAmount: ctx.registration.totalAmount,
      addOnTotal: ctx.registration.addOnTotal,
      transactionFee: ctx.registration.transactionFee,
      discountAmount: ctx.registration.discountAmount,
      discountType: ctx.registration.discountType,
      promoCode: ctx.registration.promoCode,
      runnerCount: ctx.runnerCount,
      paymentMethod: ctx.registration.paymentMethod,
    },
    // How an upgrade may be paid: the way the entry was paid (category-change-hold.ts).
    paymentChoices: paymentChoicesForOrder(ctx.registration.paymentMethod),
    event: {
      categoryChangeFee: ctx.event.categoryChangeFee,
      downgradeRefundPolicy: ctx.event.downgradeRefundPolicy,
      deadline: deadline ? deadline.toISOString() : null,
    },
    categories: ctx.event.categories.map(category => {
      const count = taken.get(category.id) ?? 0;
      return {
        ...category,
        taken: count,
        // The runner's own seat is in their current option, so a full current
        // option is not "full" to them; every other is full at its limit.
        full:
          category.id !== ctx.runner.categoryId &&
          category.slotLimit !== null &&
          category.slotLimit > 0 &&
          count >= category.slotLimit,
      };
    }),
    quote: to ? quoteFor(ctx, to, input.basisAdjustment ?? null) : null,
  };
}

export type CategoryChangePreview = Awaited<ReturnType<typeof previewCategoryChange>>;

