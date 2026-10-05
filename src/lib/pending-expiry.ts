import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { PAYMENT_METHODS, isBankTransfer } from '@/lib/registration-codes';
import type { AuditEntry } from '@/lib/audit';

/**
 * When an unpaid online checkout stops holding what it took, and what handing
 * it back involves.
 *
 * A runner who opens PayMongo and closes the tab leaves a `PENDING`
 * registration behind. Two things stay held by it, both by design elsewhere in
 * the app:
 *
 *  - **A category slot.** `SLOT_HOLDING_STATUSES` counts PENDING, because a
 *    bank transfer sits pending for days waiting on a human and counting only
 *    PAID would oversell every event that takes them.
 *  - **A promo redemption.** `redeemPromoCode` spends the code the moment the
 *    order is written, the same instant the slot is taken, or one single-use
 *    voucher could be attached to any number of unfinished checkouts at once.
 *
 * Both are the right call at checkout and neither has ever been undone. A race
 * could therefore read as sold out on orders that were never going to arrive,
 * and a batch of two hundred invite vouchers could read as fully claimed by
 * people who never paid.
 *
 * The rule lives in this module rather than in the cron route because the route
 * is only a trigger: the window, the payment methods this may touch and the
 * order the work happens in are the decision, and a second trigger (a manual
 * sweep, a script, a test) must not be able to disagree with the first about
 * any of them.
 *
 * **A bank transfer is never swept.** It is *supposed* to sit PENDING while an
 * organizer looks at a deposit slip, and that can easily outlast any window
 * worth setting for an online checkout. Expiring one would cancel a
 * registration somebody has already paid for.
 *
 * **The runner is not emailed.** Resend's free tier stops at 100 recipients a
 * day, and spending one to tell somebody that the checkout they walked away
 * from has been tidied up is the worst trade available. The organizer sees it
 * on the registrants screen instead.
 */

/**
 * How long an unpaid online checkout is left alone.
 *
 * Twenty-four hours is a deliberate middle. Shorter, and a runner who wandered
 * off mid-payment and came back after dinner finds their order gone and their
 * slot sold. Much longer, and a sold-out race holds seats for a week on orders
 * that were abandoned in the first ten minutes — which is the failure this
 * exists to end.
 *
 * A named constant rather than a number in a query, so changing the window is
 * one edit and the reasoning above stays attached to it.
 */
export const PENDING_EXPIRY_HOURS = 24;

/**
 * The most registrations one sweep will expire.
 *
 * Each one is its own transaction (see below), so an unbounded sweep on a
 * neglected database is a serverless function that runs out of time halfway
 * through and leaves no record of where it stopped. Capped, oldest first, the
 * work is simply finished by the next run, and the result says it was cut
 * short rather than reporting a clean sweep it did not do.
 */
export const MAX_SWEEP = 200;

/** The registration this module needs in order to expire one row. */
type Sweepable = {
  id: string;
  orderRef: string;
  promoCode: string | null;
  event: { organizerId: string };
  /**
   * Only what a released seat needs: which category each runner entered, and
   * whether they were given a promotion price in it. A repricing promotion is
   * capped in runners, so an abandoned group of three that took two seats has
   * to hand back exactly two.
   */
  runners: { categoryId: string; promoPrice: number | null }[];
};

/** What one sweep did, in the words the cron route reports back. */
export type SweepResult = {
  /** Registrations moved to EXPIRED. */
  expired: number;
  /** Promo redemptions handed back — never more than `expired`. */
  redemptionsReleased: number;
  /** True when `MAX_SWEEP` was reached and there is more still waiting. */
  truncated: boolean;
  /** The order references expired, so a run is traceable in the logs. */
  orderRefs: string[];
};

/** The moment before which an unpaid online checkout has waited long enough. */
export function expiryCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);
}

/**
 * The rows a sweep may touch: unpaid, not a bank transfer, and old enough.
 *
 * `paymentMethod` is matched case-insensitively because registrations written
 * before `registration-codes.ts` uppercased the coded columns still hold
 * `bank_transfer` in lowercase, and those guards accept either casing on read
 * rather than demanding a backfill. A case-sensitive exclusion here would sweep
 * exactly the old bank transfers it is meant to protect.
 *
 * `expiredAt: null` is belt as well as braces: nothing already EXPIRED is still
 * PENDING, but the two conditions together are what make a second pass over the
 * same row impossible even if a status were later hand-edited back.
 */
export function sweepableWhere(now: Date = new Date()) {
  return {
    status: 'PENDING',
    expiredAt: null,
    createdAt: { lt: expiryCutoff(now) },
    NOT: {
      paymentMethod: {
        equals: PAYMENT_METHODS.BANK_TRANSFER,
        mode: 'insensitive' as const,
      },
    },
  };
}

/**
 * Expire every abandoned online checkout that has waited out the window.
 *
 * **One transaction per registration, not one for the sweep.** A single
 * transaction over two hundred rows would hold a lock on every promotion they
 * touched for the length of the run, and a checkout landing in the middle of it
 * would queue behind a piece of housekeeping. Per row, the longest anyone waits
 * is one row's work, and a failure part-way through leaves the rows already
 * done correctly expired rather than rolling the whole sweep back.
 *
 * Inside each transaction the order is deliberate:
 *
 *  1. **Claim the row** with a conditional `updateMany` — still PENDING, still
 *     unexpired. That claim is the guard: with two overlapping sweeps, or a
 *     payment landing between the query and the write, only one of them updates
 *     the row. A count of zero means somebody else got there first and we do
 *     nothing more, which is what stops a redemption being handed back twice.
 *  2. **Then release the redemption**, only if the claim succeeded.
 *
 * The slot needs no action at all. It is held by the status, so it is released
 * the moment the status leaves `SLOT_HOLDING_STATUSES` — there is no counter to
 * decrement and nothing that could drift out of step with the row.
 */
export async function expirePendingRegistrations(
  now: Date = new Date(),
): Promise<SweepResult> {
  const candidates: Sweepable[] = await prisma.registration.findMany({
    where: sweepableWhere(now),
    // Oldest first, so a capped run always clears the longest-standing holds
    // and the ones it leaves behind are the ones with the least claim on a slot.
    orderBy: { createdAt: 'asc' },
    take: MAX_SWEEP + 1,
    select: {
      id: true,
      orderRef: true,
      promoCode: true,
      event: { select: { organizerId: true } },
      // Only what a released seat needs. A repricing promotion is capped in
      // runners, so the sweep has to know how many of this order's runners
      // were actually sold at its price — see releaseRedemption.
      // A removed runner already gave its seat up when it was removed, as it
      // did when removal was a hard delete; counting it here would hand back a
      // seat twice.
      runners: { where: { deletedAt: null }, select: { categoryId: true, promoPrice: true } },
    },
  });

  const truncated = candidates.length > MAX_SWEEP;
  const batch = candidates.slice(0, MAX_SWEEP);

  const orderRefs: string[] = [];
  let redemptionsReleased = 0;

  for (const registration of batch) {
    const released = await prisma.$transaction(async tx => {
      const claim = await tx.registration.updateMany({
        where: { id: registration.id, status: 'PENDING', expiredAt: null },
        data: { status: 'EXPIRED', expiredAt: now },
      });
      if (claim.count === 0) return null;

      return releaseRedemption(tx, registration);
    });

    if (released === null) continue;
    orderRefs.push(registration.orderRef);
    if (released) redemptionsReleased += 1;
  }

  return { expired: orderRefs.length, redemptionsReleased, truncated, orderRefs };
}

/**
 * Hand one redemption back to the promotion the abandoned order took it from.
 *
 * Attribution is by the **code text scoped to the organizer**, exactly as
 * `promo-redemptions.ts` does it and for the same reason: `promoCode` is a
 * snapshot string rather than a relation, kept that way so a deleted promotion
 * cannot rewrite a receipt, so there is no id to join on. The organizer scope
 * is not optional — two organizers may each run an `EARLYBIRD`, and giving a
 * redemption back to the wrong one would let a stranger's voucher be spent
 * twice.
 *
 * The row is locked `FOR UPDATE` before the new count is written, mirroring
 * `redeemPromoCode`, because the value is read and then written: without the
 * lock, a redemption landing between the two would be undone by this decrement
 * writing back a count it read before that redemption existed.
 *
 * **Never below zero.** A promotion deleted and recreated under the same code
 * inherits the old code's history (the accepted consequence of matching on
 * text), so a fresh row sitting at `usageCount: 0` can legitimately be handed
 * back a redemption it never sold. Clamping is the honest answer: the count
 * means "how many are spent", and a negative one would sell an extra voucher.
 *
 * **A repricing promotion hands back seats as well**, and those are counted in
 * runners rather than orders. The number comes from the runners themselves —
 * each carries the price it was actually sold at in `Runner.promoPrice` — and
 * never from the promotion's current price list, because an order that took
 * two of the last three seats must give back two. Recomputing it from the
 * promotion would give back three, quietly inflating a capped early bird every
 * time a group abandoned a checkout. Same lock, same clamp, same reasons.
 *
 * Returns whether anything was actually handed back — a promotion since
 * deleted, or an order that used no code at all, is not a failure.
 *
 * Exported for the other ways a PENDING order ends without being paid — an
 * organizer cancelling it on the status route, or its last runner being
 * removed (`cancelEmptiedOrders` below). They hand back exactly what the sweep
 * would, so there is one copy of this to keep right. The caller must already
 * have claimed the status change in the same transaction, or a redemption can
 * be handed back twice.
 */
export async function releaseRedemption(tx: any, registration: Sweepable): Promise<boolean> {
  const code = registration.promoCode;
  if (!code) return false;

  const promo = await tx.promoCode.findFirst({
    where: { code, organizerId: registration.event.organizerId },
    select: { id: true },
  });
  if (!promo) return false;

  const locked: { usageCount: number; discountType: string }[] = await tx.$queryRaw`
    SELECT "usageCount", "discountType" FROM "PromoCode" WHERE "id" = ${promo.id} FOR UPDATE`;
  const row = locked[0];
  if (!row) return false;

  // The seats this order actually took, per category, read off the runners.
  let discountedRunners = 0;
  const seats = new Map<string, number>();
  for (const runner of registration.runners) {
    if (runner.promoPrice === null) continue;
    discountedRunners++;
    seats.set(runner.categoryId, (seats.get(runner.categoryId) ?? 0) + 1);
  }

  // Sorted for the same reason redeemPromoCode sorts: two transactions
  // touching the same promotion's categories must take them in one order.
  for (const categoryId of [...seats.keys()].sort()) {
    const back = seats.get(categoryId) ?? 0;
    if (back <= 0) continue;

    const held: { usageCount: number }[] = await tx.$queryRaw`
      SELECT "usageCount" FROM "PromoCategoryPrice"
      WHERE "promoCodeId" = ${promo.id} AND "categoryId" = ${categoryId} FOR UPDATE`;
    const seat = held[0];
    // The price row is gone — the organizer stopped repricing that category.
    // There is no seat to hand back, and that is not a failure.
    if (!seat) continue;

    await tx.promoCategoryPrice.updateMany({
      where: { promoCodeId: promo.id, categoryId },
      // Clamped for the same reason the redemption count is: a promotion
      // recreated under an old code inherits its history, so a fresh row can
      // legitimately be handed back seats it never sold.
      data: { usageCount: Math.max(0, seat.usageCount - back) },
    });
  }

  const { limitCountsRunners } = await import('@/lib/discount');
  const countBack = limitCountsRunners(row.discountType) ? Math.max(0, discountedRunners) : 1;

  await tx.promoCode.update({
    where: { id: promo.id },
    data: { usageCount: Math.max(0, row.usageCount - countBack) },
  });
  return true;
}

/**
 * Which registrations an admin list shows: everything except an online order
 * that was never paid.
 *
 * The owner's rule: a card / QRPh / GCash / Maya order is not a registration
 * until PayMongo confirms the money, so it stays off the registrants screen
 * while it is PENDING and after the sweep above turns it EXPIRED. It still
 * holds its slot in the background (SLOT_HOLDING_STATUSES) — hiding it changes
 * what an organizer sees, not what the capacity count believes.
 *
 * A bank transfer is always listed: its PENDING is the organizer's to-do list.
 */
export function listedRegistrationWhere() {
  return {
    OR: [
      { status: { notIn: ['PENDING', 'EXPIRED'] } },
      { paymentMethod: { equals: PAYMENT_METHODS.BANK_TRANSFER, mode: 'insensitive' as const } },
    ],
  };
}

/**
 * A bank transfer sitting PENDING: money a runner says they sent, waiting on a
 * person to check the deposit slip. It is a registrant — the listed screen
 * shows it (`listedRegistrationWhere`) and the overview's queue is made of it.
 */
export function awaitingVerificationWhere() {
  return {
    status: 'PENDING',
    paymentMethod: { equals: PAYMENT_METHODS.BANK_TRANSFER, mode: 'insensitive' as const },
  };
}

/**
 * An online checkout that was opened and never paid — `listedRegistrationWhere`'s
 * counterpart, the PENDING orders that list leaves out.
 *
 * The owner's ruling (UNPAID_ORDERS_PLAN.md, 2026-10-05): this is **never
 * called a registrant**. A client once read four registrants on the overview
 * where the registrants screen listed one, because the counts took every
 * PENDING runner and the list did not. Every screen now counts from these two
 * filters and `PAID`, so the count and the list cannot drift apart again.
 *
 * It still holds its slot until the sweep expires it — the capacity count
 * (`SLOT_HOLDING_STATUSES`) is unchanged; only the word on the screen is.
 */
export function unpaidCheckoutWhere() {
  return {
    status: 'PENDING',
    NOT: { paymentMethod: { equals: PAYMENT_METHODS.BANK_TRANSFER, mode: 'insensitive' as const } },
  };
}

/**
 * The hour (UTC) the sweep runs. It must match the cron in `vercel.json`
 * (`0 18 * * *`, 02:00 Manila). The two cannot share one value, because
 * `vercel.json` is not code, so a change to one must be made in the other too.
 */
export const SWEEP_HOUR_UTC = 18;

/**
 * The latest time an unpaid online checkout created at `createdAt` can still
 * be PENDING. It is the first sweep that finds the order past the window, plus
 * one hour, because Vercel's Hobby plan runs a daily cron at some point within
 * the hour, not on the minute.
 *
 * Shown on the Unpaid checkouts tab as "expires by". Computed from the real
 * schedule rather than `createdAt + PENDING_EXPIRY_HOURS`, because the sweep
 * runs once a day: an order opened at 03:00 Manila holds its slot for almost
 * two days, and staff following it up need that true answer.
 */
export function expiresBy(createdAt: Date): Date {
  const eligibleAfter = createdAt.getTime() + PENDING_EXPIRY_HOURS * 60 * 60 * 1000;
  const sweep = new Date(eligibleAfter);
  sweep.setUTCHours(SWEEP_HOUR_UTC, 0, 0, 0);
  // The sweep only takes orders created strictly before its own cutoff, so a
  // run at the exact moment the window closes does not take this one yet.
  if (sweep.getTime() <= eligibleAfter) sweep.setUTCDate(sweep.getUTCDate() + 1);
  return new Date(sweep.getTime() + 60 * 60 * 1000);
}

/**
 * The orders on the registrants screen's Unpaid checkouts tab
 * (UNPAID_ORDERS_PLAN.md Batch 3): every unpaid online checkout, plus the ones
 * the sweep already expired, until race day is over.
 *
 * The expired ones stay because staff follow these orders up by hand: a runner
 * whose checkout expired last night may still want to enter. After race day
 * there is no one left to follow up, so they leave the tab (the rows stay in
 * the database). `raceDay` and `today` are both Manila calendar days, the
 * format `Event.date` holds.
 *
 * An order with no live runner is left out, as it is from the overview's
 * queue. There is nobody on it to contact.
 *
 * **CANCELLED online orders come too, until race day** (UNPAID_FOLLOWUP_PLAN.md
 * Batch 2, decision D6), so a mistaken Cancel order… can be found under
 * Filters → Status → Cancelled. The tab hides them by default and keeps only
 * those `isCancelledCheckout` says were cancelled while unpaid: this filter
 * cannot read the trail, and an online order paid and then cancelled is a
 * registrant, not an unpaid checkout.
 */
export function unpaidFollowUpWhere(raceDay: string, today: string): Prisma.RegistrationWhereInput {
  return {
    deletedAt: null,
    status: today <= raceDay ? { in: ['PENDING', 'EXPIRED', 'CANCELLED'] } : 'PENDING',
    NOT: { paymentMethod: { equals: PAYMENT_METHODS.BANK_TRANSFER, mode: 'insensitive' } },
    runners: { some: { deletedAt: null } },
  };
}

/**
 * Whether a CANCELLED order was an online checkout closed before it was ever
 * paid (Cancel order… on the Unpaid checkouts tab, UNPAID_FOLLOWUP_PLAN.md
 * Batch 2). Such an order was **never a registrant** — the owner's rule above
 * `unpaidCheckoutWhere` — so it stays on the Unpaid checkouts tab and off the
 * registrants list, where `listedRegistrationWhere` would otherwise show every
 * CANCELLED order.
 *
 * The schema keeps no "was paid" mark, so the trail is what tells the two
 * apart: the order's latest status change (`latestStatusChanges`) moved it to
 * CANCELLED from PENDING or EXPIRED. A cancelled order with no such line was
 * paid first, or predates the trail, and stays a registrant as it always was.
 */
export function isCancelledCheckout(
  order: { status: string; paymentMethod: string },
  lastMove: { from: string | null; to: string } | null | undefined,
): boolean {
  return (
    order.status === 'CANCELLED' &&
    !isBankTransfer(order.paymentMethod) &&
    lastMove?.to === 'CANCELLED' &&
    (lastMove.from === 'PENDING' || lastMove.from === 'EXPIRED')
  );
}

/**
 * The runners holding a place, in the three kinds every screen names: paid,
 * awaiting verification (a bank transfer) and unpaid checkout. Registrants are
 * the first two; together the three are the taken slots.
 */
export type HeldPlaces = { paid: number; awaiting: number; unpaid: number };

/**
 * `HeldPlaces` per category for the runners `runnerWhere` picks, in three
 * grouped queries however many categories there are. One function for the
 * events table, the overview and the client viewer, so none of them can sort a
 * runner into a different kind than the others.
 *
 * A removed runner, or one on a removed order, is kept for the trail and never
 * counted.
 */
export async function heldPlacesByCategory(
  runnerWhere: Prisma.RunnerWhereInput,
): Promise<Map<string, HeldPlaces>> {
  const count = (registration: Prisma.RegistrationWhereInput) =>
    prisma.runner.groupBy({
      by: ['categoryId'],
      where: { ...runnerWhere, deletedAt: null, registration: { ...registration, deletedAt: null } },
      _count: { _all: true },
    });
  const [paid, awaiting, unpaid] = await Promise.all([
    count({ status: 'PAID' }),
    count(awaitingVerificationWhere()),
    count(unpaidCheckoutWhere()),
  ]);

  const byCategory = new Map<string, HeldPlaces>();
  const add = (rows: typeof paid, kind: keyof HeldPlaces) => {
    for (const row of rows) {
      const places = byCategory.get(row.categoryId) ?? { paid: 0, awaiting: 0, unpaid: 0 };
      places[kind] += row._count._all;
      byCategory.set(row.categoryId, places);
    }
  };
  add(paid, 'paid');
  add(awaiting, 'awaiting');
  add(unpaid, 'unpaid');
  return byCategory;
}

/** A runner just removed in the caller's transaction: its order, and the seat it held. */
export type RemovedRunner = {
  registrationId: string;
  categoryId: string;
  promoPrice: number | null;
};

/** An order `cancelEmptiedOrders` cancelled, for the caller's trail. */
export type CancelledEmptyOrder = {
  registrationId: string;
  orderRef: string;
  promoCode: string | null;
  promoReleased: boolean;
};

/**
 * Cancel every PENDING order that the runners just removed left with no live
 * runner (UNPAID_ORDERS_PLAN.md Batch 5).
 *
 * An order with nobody on it is not a registration, yet it still held its slot
 * and its promo and sat in the "awaiting verification" queue — the empty
 * RM-721849AE that made a client think they had four runners. So removing the
 * last runner of a PENDING order ends the order in the same transaction:
 * CANCELLED, and the promo handed back exactly as the sweep does.
 *
 * **A PAID order is left alone.** Somebody paid for it, and whether that money
 * goes back is a person's call, not this function's; the delete confirmation
 * tells the admin to settle it separately.
 *
 * Call it **after** the runners are marked removed, inside the same
 * transaction. Each order row is locked first, so two removals racing for the
 * last two runners of one order cannot both see the other runner still live:
 * whichever takes the lock second re-counts after the first has committed. The
 * cancel is then the same conditional claim the sweep makes, so an order the
 * sweep or a payment got to first is not touched and nothing is handed back
 * twice.
 *
 * The promo seats handed back are the removed runners' own. A runner removed
 * earlier kept its seat spent, as it always has, so counting it now would
 * hand back a seat the promotion has already written off.
 */
export async function cancelEmptiedOrders(
  tx: Prisma.TransactionClient,
  removed: RemovedRunner[],
): Promise<CancelledEmptyOrder[]> {
  const byOrder = new Map<string, RemovedRunner[]>();
  for (const runner of removed) {
    byOrder.set(runner.registrationId, [...(byOrder.get(runner.registrationId) ?? []), runner]);
  }

  const cancelled: CancelledEmptyOrder[] = [];
  // Sorted, so two transactions locking the same orders take them in one order.
  for (const registrationId of [...byOrder.keys()].sort()) {
    await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${registrationId} FOR UPDATE`;

    const live = await tx.runner.count({ where: { registrationId, deletedAt: null } });
    if (live > 0) continue;

    const claim = await tx.registration.updateMany({
      where: { id: registrationId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (claim.count === 0) continue;

    const registration = await tx.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, orderRef: true, promoCode: true, event: { select: { organizerId: true } } },
    });
    if (!registration) continue;
    const promoReleased = await releaseRedemption(tx, {
      ...registration,
      runners: (byOrder.get(registrationId) ?? []).map(({ categoryId, promoPrice }) => ({
        categoryId,
        promoPrice,
      })),
    });
    cancelled.push({
      registrationId,
      orderRef: registration.orderRef,
      promoCode: registration.promoCode,
      promoReleased,
    });
  }
  return cancelled;
}

/** The trail row for an order `cancelEmptiedOrders` cancelled, one per order. */
export function emptiedOrderAudit(
  order: CancelledEmptyOrder,
  scope: { eventId: string; organizerId: string },
): AuditEntry {
  const promo = order.promoReleased ? ` Promo ${order.promoCode} handed back.` : '';
  return {
    action: 'registration.status.changed',
    entityType: 'Registration',
    entityId: order.registrationId,
    ...scope,
    summary: `Cancelled ${order.orderRef} (was PENDING): its last runner was removed.${promo}`,
    changes: { status: ['PENDING', 'CANCELLED'] },
  };
}

/**
 * Undo an online order whose PayMongo checkout could not even be created.
 *
 * The row is written first because that write is what reserves the slot and
 * spends the promo (see api/checkout), but when PayMongo then rejects the
 * request the runner never reached a payment page and only saw an error. The
 * owner's ruling is that such an attempt leaves no trace: the row and its
 * runners are deleted in the same request and the promo redemption is handed
 * back, so a retry starts clean instead of stacking duplicate PENDING orders.
 *
 * Guarded to a PENDING, non-bank-transfer row, so it can never remove an order
 * somebody has paid for or a transfer awaiting verification.
 */
export async function discardFailedCheckout(registrationId: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const registration = await tx.registration.findFirst({
      where: {
        id: registrationId,
        status: 'PENDING',
        NOT: { paymentMethod: { equals: PAYMENT_METHODS.BANK_TRANSFER, mode: 'insensitive' } },
      },
      select: {
        id: true,
        orderRef: true,
        promoCode: true,
        event: { select: { organizerId: true } },
        runners: { where: { deletedAt: null }, select: { categoryId: true, promoPrice: true } },
      },
    });
    if (!registration) return;

    await releaseRedemption(tx, registration);
    await tx.runner.deleteMany({ where: { registrationId } });
    await tx.registration.delete({ where: { id: registrationId } });
  });
}
