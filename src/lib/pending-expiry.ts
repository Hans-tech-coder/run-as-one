import prisma from '@/lib/db';
import { PAYMENT_METHODS } from '@/lib/registration-codes';

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
      runners: { select: { categoryId: true, promoPrice: true } },
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
 */
async function releaseRedemption(tx: any, registration: Sweepable): Promise<boolean> {
  const code = registration.promoCode;
  if (!code) return false;

  const promo = await tx.promoCode.findFirst({
    where: { code, organizerId: registration.event.organizerId },
    select: { id: true },
  });
  if (!promo) return false;

  const locked: { usageCount: number }[] = await tx.$queryRaw`
    SELECT "usageCount" FROM "PromoCode" WHERE "id" = ${promo.id} FOR UPDATE`;
  const row = locked[0];
  if (!row) return false;

  // The seats this order actually took, per category, read off the runners.
  const seats = new Map<string, number>();
  for (const runner of registration.runners) {
    if (runner.promoPrice === null) continue;
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

  await tx.promoCode.update({
    where: { id: promo.id },
    data: { usageCount: Math.max(0, row.usageCount - 1) },
  });
  return true;
}
