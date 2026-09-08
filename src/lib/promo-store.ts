import prisma from '@/lib/db';
import {
  AppliedDiscount,
  OrderBasis,
  PromoTerms,
  bestDiscount,
  normalizePromoCode,
  outshoneByMessage,
  promoCodeError,
} from '@/lib/discount';

/**
 * Reading promo codes out of the database, kept apart from the rule that
 * prices them.
 *
 * `discount.ts` is imported by both wizards, which are client components, so it
 * must stay free of Prisma — the same split `running-community.ts` and
 * `running-community-store.ts` already use. Everything here is server-only.
 */

/** The columns the runner-facing half of the feature reads. */
export const PROMO_TERMS_SELECT = {
  id: true,
  code: true,
  discountType: true,
  discountValue: true,
  usageLimit: true,
  usageCount: true,
  validFrom: true,
  validUntil: true,
  minSubtotal: true,
  minRunners: true,
  buyQuantity: true,
  getQuantity: true,
  automatic: true,
} as const;

export type StoredPromo = PromoTerms & { id: string };

/**
 * The code this event will honour, or null.
 *
 * Scoped to the organizer who owns the event and then to the event itself: a
 * code either names this event or names none, in which case it covers every
 * event that organizer runs. This is why the unique constraint could narrow
 * from the code alone to the code within its organizer — the lookup always
 * arrives knowing whose code it is looking for.
 */
export async function findPromoCode(
  event: { id: string; organizerId: string },
  code: string,
): Promise<StoredPromo | null> {
  const cleaned = normalizePromoCode(code);
  if (!cleaned) return null;

  return prisma.promoCode.findFirst({
    where: {
      code: cleaned,
      organizerId: event.organizerId,
      // An automatic promotion is not a code. Its `code` column holds its
      // name, and a runner who happens to type that name has not claimed
      // anything — it is already on their order.
      automatic: false,
      // Null is the organizer-wide code, which is what every code created
      // before scoping existed is.
      OR: [{ eventId: null }, { eventId: event.id }],
    },
    select: PROMO_TERMS_SELECT,
  });
}

/**
 * Every promotion this event applies on its own, with no code typed.
 *
 * Read on the event page and by both wizards on load, so it is deliberately a
 * narrow query on its own index. Exhausted and expired promotions are left in
 * — the arithmetic that decides whether one applies lives in `discount.ts`,
 * and duplicating half of it as a `where` clause is how the badge on the event
 * page and the discount on the order start disagreeing.
 */
export async function automaticPromosFor(event: {
  id: string;
  organizerId: string;
}): Promise<StoredPromo[]> {
  return prisma.promoCode.findMany({
    where: {
      organizerId: event.organizerId,
      automatic: true,
      OR: [{ eventId: null }, { eventId: event.id }],
    },
    select: PROMO_TERMS_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

/** The public projection — terms only, never the id or who owns it. */
export function promoTerms(promo: StoredPromo): PromoTerms {
  const { id: _id, ...terms } = promo;
  return terms;
}

/** What a checkout route needs to know about the code it was handed. */
export interface ResolvedDiscount {
  /** The row, so the write can spend a redemption against it. */
  promo: StoredPromo | null;
  /** What it takes off, or null when no usable code was sent. */
  applied: AppliedDiscount | null;
  /** The sentence to hand back with a 400, or null when the code is fine. */
  error: string | null;
}

/**
 * The server's own answer about a promo code, recomputed from the database.
 *
 * Both checkout routes call this instead of reading a discount off the
 * request, for exactly the reason they already refuse a client's subtotal: a
 * tab left open can POST anything, and an amount that arrives from the browser
 * is a suggestion. The wizard's summary and this call run the same
 * `promoCodeError` and `applyPromo`, so an accepted code prices identically in
 * both places — and a code that has expired since the page loaded is refused
 * here with the same sentence the wizard would have shown.
 */
export async function resolveDiscount(
  event: { id: string; organizerId: string },
  code: unknown,
  order: OrderBasis & { deliveryChosen: boolean },
): Promise<ResolvedDiscount> {
  const cleaned = normalizePromoCode(code);

  const [automatic, typed] = await Promise.all([
    automaticPromosFor(event),
    cleaned ? findPromoCode(event, cleaned) : Promise.resolve(null),
  ]);

  // A code that was actually typed and cannot be used is an error, even when
  // an automatic promotion would have covered the order anyway: the runner
  // asked a question with that code and deserves the answer. A code that is
  // merely *smaller* than the automatic discount is not an error — see below.
  if (cleaned) {
    const problem = promoCodeError(typed, order, cleaned);
    if (problem) return { promo: null, applied: null, error: problem };
  }

  const winner = bestDiscount([...automatic, typed], order);
  if (!winner) return { promo: null, applied: null, error: null };

  // Which row won, so the write can spend a redemption against the right one.
  const promo =
    [...automatic, typed].find(candidate => candidate?.code === winner.code) ?? null;

  return { promo, applied: winner, error: null };
}

/**
 * Whether a perfectly good code lost to a bigger automatic promotion, as the
 * sentence to show the runner — or null when it did not.
 *
 * Separate from `resolveDiscount`'s `error` on purpose: this is not a refusal,
 * nothing has gone wrong, and the order still gets the larger discount.
 */
export function outshoneCode(
  typedCode: unknown,
  winner: AppliedDiscount | null,
): string | null {
  const cleaned = normalizePromoCode(typedCode);
  if (!cleaned || !winner || winner.code === cleaned) return null;
  return outshoneByMessage(cleaned, winner);
}
