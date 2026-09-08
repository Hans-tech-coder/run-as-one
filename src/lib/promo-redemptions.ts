import prisma from '@/lib/db';

/**
 * What a promotion actually cost, and which orders spent it.
 *
 * "Times Redeemed: 12" says how many, never how much, and an organizer
 * deciding whether to run a promotion again is asking the second question.
 * Both the peso total on the marketing table and the list behind *View
 * redemptions* read from here, because a column saying ₱4,500 and a modal
 * adding up to ₱5,200 would be worse than neither.
 *
 * **Attribution is by the code text, scoped to the organizer's own events.**
 * `Registration.promoCode` is a snapshot string rather than a relation — kept
 * that way on purpose so a deleted promotion cannot rewrite a receipt — so
 * there is no id to match on and the text is all there is. Two consequences,
 * both accepted:
 *
 *  - A promotion deleted and later recreated under the same code inherits its
 *    own history. That is arguably the honest answer anyway: it is the same
 *    code, and the runners who used it were given the same thing.
 *  - An automatic promotion is attributed exactly the same way, because
 *    checkout snapshots its *name* into the same column.
 *
 * **Money is counted on `PAID` rows only, redemptions on placement.** A code is
 * spent the moment the order is created, the same instant a slot is taken, so
 * an abandoned online checkout leaves a redemption with no money behind it.
 * Reporting that pending order as money given away would overstate the cost of
 * every promotion with an abandoned checkout in its past. The two numbers are
 * genuinely different, and the screens above show both rather than quietly
 * preferring one.
 *
 * Server-only, like `promo-store.ts` and for the same reason: the rule that
 * *prices* a promotion lives in `discount.ts` and is imported by both wizards,
 * so Prisma must stay out of it.
 */

/**
 * The status whose money has actually moved.
 *
 * Named rather than inlined because two queries here have to agree about it,
 * and because "paid" is a decision — `PENDING` covers both a bank transfer
 * waiting on a human and an online checkout nobody finished, and neither has
 * put a peso anywhere yet.
 */
export const MONEY_MOVED_STATUS = 'PAID';

/** What a promotion has given away, and how many orders actually paid. */
export type PromoSpend = {
  /** Orders that used it and reached `PAID`. */
  paid: number;
  /** Centavos discounted across those orders. */
  given: number;
};

/** Nothing spent yet — the shape a promotion nobody has used still has. */
export const NO_SPEND: PromoSpend = { paid: 0, given: 0 };

/**
 * The most redemptions one listing returns.
 *
 * A batch of vouchers is capped at 500 by `MAX_VOUCHER_BATCH`, but a single
 * shared code with no usage limit has no ceiling at all, and an organizer
 * scrolling a modal is not reading the ten-thousandth row of it. The response
 * says when it has been cut short rather than quietly showing part of the
 * truth.
 */
export const MAX_REDEMPTIONS_LISTED = 500;

/**
 * Every promotion's spend, keyed by the code text that was snapshotted.
 *
 * One grouped query for the whole marketing screen rather than one per row:
 * the table already holds every promotion the organizer has, and asking the
 * database two hundred times to fill in a column is how a page with a voucher
 * batch on it stops loading.
 *
 * A code in the result that no longer matches a promotion is a redemption of
 * something since deleted. It is left in the map — the caller decides whether
 * a promotion that no longer exists belongs in its total.
 */
export async function spendByCode(organizerId: string): Promise<Map<string, PromoSpend>> {
  const rows = await prisma.registration.groupBy({
    by: ['promoCode'],
    where: {
      promoCode: { not: null },
      status: MONEY_MOVED_STATUS,
      event: { organizerId },
    },
    _sum: { discountAmount: true },
    _count: { _all: true },
  });

  const spend = new Map<string, PromoSpend>();
  for (const row of rows) {
    if (!row.promoCode) continue;
    spend.set(row.promoCode, {
      paid: row._count._all,
      given: row._sum.discountAmount ?? 0,
    });
  }
  return spend;
}

/** One order that used a promotion, as the redemptions list shows it. */
export type PromoRedemption = {
  id: string;
  orderRef: string;
  /** Which code was typed — the thing that differs inside a voucher batch. */
  code: string | null;
  eventId: string;
  eventTitle: string;
  runners: number;
  status: string;
  /** Centavos taken off this order. */
  discountAmount: number;
  createdAt: string;
};

/**
 * The orders that used any of these codes, newest first.
 *
 * Takes every code of the promotion rather than one, because **a batch is one
 * promotion**: an organizer asking who used their invite vouchers means all
 * two hundred of them, exactly as `batchWhere()` in the promo route means all
 * two hundred rows.
 *
 * Scoped to the organizer's own events in the query itself, not filtered after
 * the fact — the code text is not proof of ownership, and two organizers may
 * each have an `EARLYBIRD`.
 */
export async function redemptionsFor(
  codes: string[],
  organizerId: string,
): Promise<{ redemptions: PromoRedemption[]; truncated: boolean }> {
  if (codes.length === 0) return { redemptions: [], truncated: false };

  const rows = await prisma.registration.findMany({
    where: { promoCode: { in: codes }, event: { organizerId } },
    orderBy: { createdAt: 'desc' },
    // One more than we will show, so "there are more of these" is a fact from
    // the database rather than a guess from a full page.
    take: MAX_REDEMPTIONS_LISTED + 1,
    select: {
      id: true,
      orderRef: true,
      promoCode: true,
      status: true,
      discountAmount: true,
      createdAt: true,
      event: { select: { id: true, title: true } },
      _count: { select: { runners: true } },
    },
  });

  const truncated = rows.length > MAX_REDEMPTIONS_LISTED;
  return {
    truncated,
    redemptions: rows.slice(0, MAX_REDEMPTIONS_LISTED).map(row => ({
      id: row.id,
      orderRef: row.orderRef,
      code: row.promoCode,
      eventId: row.event.id,
      eventTitle: row.event.title,
      runners: row._count.runners,
      status: row.status,
      discountAmount: row.discountAmount,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
