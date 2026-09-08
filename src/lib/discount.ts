import { formatPesos } from '@/lib/money';

/**
 * Promo codes: what kinds exist, when one applies, and what it takes off.
 *
 * `PromoCode` rows existed long before this module and were never wired into
 * checkout — an organizer could create a code and nothing anywhere could spend
 * it. This is the rule that makes one real, and it lives here rather than in
 * the checkout routes because **three places have to agree about it**: both
 * wizards, which show the runner what a code is worth before they pay, and
 * both checkout routes, which recompute it from the database and are the last
 * word. A discount that the summary and the charge disagreed about would be
 * the worst possible bug in this app.
 *
 * The module is deliberately pure and free of Prisma except for
 * `redeemPromoCode`, so a client component can import the arithmetic and the
 * wording without pulling the database into the browser bundle — the same
 * split `delivery.ts` and `shirt-size.ts` already use.
 */

/**
 * The four kinds of promotion, modelled on the ones a Shopify merchant would
 * recognise. Stored UPPERCASE like every other coded column in this schema.
 */
export const DISCOUNT_TYPES = {
  /** A share of the goods, stored as basis points: 1000 = 10%. */
  PERCENTAGE: 'PERCENTAGE',
  /** A flat amount off the goods, in centavos. */
  FIXED: 'FIXED',
  /** Waives the race-kit delivery fee — the local answer to free shipping. */
  FREE_DELIVERY: 'FREE_DELIVERY',
  /** "Register 5, the 6th is free." */
  BUY_X_GET_Y: 'BUY_X_GET_Y',
} as const;

export type DiscountType = (typeof DISCOUNT_TYPES)[keyof typeof DISCOUNT_TYPES];

const DISCOUNT_TYPE_VALUES: readonly string[] = Object.values(DISCOUNT_TYPES);

/**
 * A discount type as the database should hold it.
 *
 * Accepts either casing, like every other guard here, and refuses anything
 * unrecognised outright rather than defaulting: `asLogisticsMethod` can fall
 * back to pickup because there is a sensible neutral answer, and there is no
 * neutral kind of discount — a code whose type we cannot read must not quietly
 * become a percentage off.
 */
export function asDiscountType(value: unknown): DiscountType | null {
  const code = String(value ?? '').trim().toUpperCase();
  return DISCOUNT_TYPE_VALUES.includes(code) ? (code as DiscountType) : null;
}

/** What an organizer picking a kind of promotion reads. */
export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  PERCENTAGE: 'Percentage off',
  FIXED: 'Fixed amount off',
  FREE_DELIVERY: 'Free delivery',
  BUY_X_GET_Y: 'Buy X, get Y free',
};

/** The row this module reasons about — the runner-facing half of a PromoCode. */
export interface PromoTerms {
  code: string;
  discountType: string;
  /** Basis points for PERCENTAGE, centavos for FIXED, 0 otherwise. */
  discountValue: number;
  usageLimit: number | null;
  usageCount: number;
  /** ISO strings once they have crossed the wire to a client component. */
  validFrom: string | Date | null;
  validUntil: string | Date | null;
  minSubtotal: number | null;
  minRunners: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  /**
   * True when this promotion needs no code — it applies on its own to any
   * order that meets its conditions. `code` is then its *name*, which is what
   * the event page badge and the order summary show.
   */
  automatic: boolean;
}

/** The order a code is being applied to. Every amount is centavos. */
export interface OrderBasis {
  /**
   * What each runner costs on their own — category price plus their own
   * large-size upcharge. From `runnerPrices` in shirt-size.ts, so BUY_X_GET_Y
   * takes off exactly what the free runner added.
   */
  runnerPrices: number[];
  /** The goods total. Equal to the sum of runnerPrices. */
  subtotal: number;
  /** What delivery is costing this order; 0 when the runner picks up. */
  deliveryFee: number;
}

/** A code that applies, and what it is worth on this order. */
export interface AppliedDiscount {
  code: string;
  type: DiscountType;
  /** Centavos taken off the order. Never more than what it applies to. */
  amount: number;
  /** How the discount describes itself in the summary: "10% off". */
  label: string;
  /** True when nobody had to type anything to get it. */
  automatic: boolean;
  /**
   * Which runners on the order are the free ones, by index into
   * `runnerPrices`. Only ever filled for BUY_X_GET_Y; empty otherwise. It is
   * what puts the FREE badge on the right card in step 1 and names the right
   * person in the summary.
   */
  freeRunners: number[];
}

/**
 * How much this code takes off this order, in centavos.
 *
 * Assumes the code has already passed `promoCodeError` — this is the
 * arithmetic, not the gate. Every branch is capped at the thing it discounts,
 * so a ₱500 code on a ₱300 order takes off ₱300 and never turns the total
 * negative.
 *
 * Fees are never discounted. The platform fee is the platform's and the
 * transaction fee is PayMongo's; neither is the organizer's to give away, and
 * a percentage that quietly ate the platform's commission would be a bug
 * nobody notices until the month's payout.
 */
export function discountAmountFor(promo: PromoTerms, order: OrderBasis): number {
  const type = asDiscountType(promo.discountType);
  if (!type) return 0;

  switch (type) {
    case DISCOUNT_TYPES.PERCENTAGE: {
      // Basis points, so 1000 = 10%. Floored: a fractional centavo has to go
      // somewhere, and rounding it towards the organizer is the direction that
      // never charges a runner more than the summary said.
      const off = Math.floor((order.subtotal * promo.discountValue) / 10000);
      return clamp(off, order.subtotal);
    }
    case DISCOUNT_TYPES.FIXED:
      return clamp(promo.discountValue, order.subtotal);
    case DISCOUNT_TYPES.FREE_DELIVERY:
      // Exactly the fee being charged, so the line always cancels out. An
      // order that chose pickup has no fee, which is why promoCodeError turns
      // that combination away rather than silently applying nothing.
      return clamp(order.deliveryFee, order.deliveryFee);
    case DISCOUNT_TYPES.BUY_X_GET_Y: {
      const free = freeRunnerCount(promo, order.runnerPrices.length);
      if (free <= 0) return 0;
      // The cheapest runners are the free ones. Any rule has to pick some, and
      // this is the one an organizer can defend to a group who ordered a mix
      // of a 10K and a 5K: the promotion gives away the smaller entry, not the
      // larger one.
      const cheapestFirst = [...order.runnerPrices].sort((a, b) => a - b);
      const off = cheapestFirst.slice(0, free).reduce((sum, price) => sum + price, 0);
      return clamp(off, order.subtotal);
    }
  }
}

/** How many runners this order gets free under a buy-X-get-Y code. */
export function freeRunnerCount(promo: PromoTerms, runners: number): number {
  const buy = positive(promo.buyQuantity);
  const get = positive(promo.getQuantity);
  if (!buy || !get) return 0;
  // Whole groups only. Five runners on a "buy 5 get 1" get nothing: the sixth
  // is the free one, and there is no sixth.
  return Math.floor(runners / (buy + get)) * get;
}

/**
 * Which runners on this order are the free ones, as indexes into
 * `runnerPrices`.
 *
 * The cheapest entries go free, which is the rule an organizer can defend to a
 * group who ordered a mix of a 10K and a 5K: the promotion gives away the
 * smaller entry, not the larger one.
 *
 * **Ties break towards the last runner**, and that is deliberate rather than
 * arbitrary. A group of six all entering the same category has six identical
 * prices, and "register 5, get 1 free" plainly means the sixth — badging
 * Runner 1 as free would be true arithmetic and a confusing thing to read
 * beside a card the group filled in first.
 */
export function freeRunnerIndexes(promo: PromoTerms, runnerPrices: number[]): number[] {
  if (asDiscountType(promo.discountType) !== DISCOUNT_TYPES.BUY_X_GET_Y) return [];
  const free = freeRunnerCount(promo, runnerPrices.length);
  if (free <= 0) return [];

  return runnerPrices
    .map((price, index) => ({ price, index }))
    .sort((a, b) => (a.price === b.price ? b.index - a.index : a.price - b.price))
    .slice(0, free)
    .map(entry => entry.index)
    .sort((a, b) => a - b);
}

/**
 * What a group would unlock by adding a few more runners, or null when there
 * is nothing to offer.
 *
 * This exists because "register 5, get 1 free" pays nothing at five runners.
 * A group of exactly five has met the condition in every sense they can see
 * and gets no discount, which reads as a broken promotion rather than as a
 * promotion they have not finished claiming. So step 1 offers it to them: at
 * five, one more runner is free.
 *
 * Offered rather than added for them — an extra required form nobody asked for
 * would block a group that really is only five, and this way the group of five
 * simply declines.
 */
export function freeSlotOffer(
  promo: PromoTerms | null | undefined,
  runners: number,
): { needed: number; free: number } | null {
  if (!promo) return null;
  if (asDiscountType(promo.discountType) !== DISCOUNT_TYPES.BUY_X_GET_Y) return null;

  const buy = positive(promo.buyQuantity);
  const get = positive(promo.getQuantity);
  if (!buy || !get) return null;

  // Where this order sits inside the current group of (buy + get). Below `buy`
  // there is nothing to offer yet — they have not paid for the free one.
  const remainder = runners % (buy + get);
  if (runners < buy || remainder < buy) return null;

  return { needed: buy + get - remainder, free: get };
}

/**
 * The best of several promotions on this order, or null when none applies.
 *
 * Only one discount is ever given. Two stacking promotions is a number the
 * organizer never agreed to — an early bird at 10% on top of a ₱200 code is a
 * giveaway nobody planned — so where more than one qualifies, the one that
 * takes off the most wins and the runner is told which.
 *
 * Ties go to the automatic one, because it is the promotion the organizer set
 * running rather than one a runner happened to be handed, and because leaving
 * a typed code unspent keeps it available for the next order.
 */
export function bestDiscount(
  promos: (PromoTerms | null | undefined)[],
  order: OrderBasis & { deliveryChosen: boolean },
): AppliedDiscount | null {
  let best: AppliedDiscount | null = null;

  for (const promo of promos) {
    if (!promo) continue;
    // The same gate the wizard shows and the checkout route enforces, so a
    // promotion that fails a condition is simply not a candidate here.
    if (promoCodeError(promo, order, promo.code)) continue;

    const applied = applyPromo(promo, order);
    if (!applied) continue;

    if (
      !best ||
      applied.amount > best.amount ||
      (applied.amount === best.amount && applied.automatic && !best.automatic)
    ) {
      best = applied;
    }
  }

  return best;
}

/**
 * What a runner is told when their code is real but worth less than the
 * discount already sitting on their order.
 *
 * Not an error and not silence. Refusing the code outright would be wrong —
 * there is nothing wrong with it — and applying nothing without a word would
 * look like the box was broken.
 */
export function outshoneByMessage(typedCode: string, winner: AppliedDiscount): string {
  return `${normalizePromoCode(typedCode)} is worth less than the ${winner.code} discount already on your order, so we kept the bigger one. Your code has not been used.`;
}

/**
 * The code applied to this order, or null when it does not apply.
 *
 * Returns the same shape the summary line and the stored columns both need, so
 * a screen showing "SUMMER10 — 10% off" and the registration recording ₱150 are
 * two readings of one call.
 */
export function applyPromo(
  promo: PromoTerms | null | undefined,
  order: OrderBasis,
): AppliedDiscount | null {
  if (!promo) return null;
  const type = asDiscountType(promo.discountType);
  if (!type) return null;
  const amount = discountAmountFor(promo, order);
  if (amount <= 0) return null;
  return {
    code: promo.code,
    type,
    amount,
    label: describePromo(promo),
    automatic: promo.automatic === true,
    freeRunners: freeRunnerIndexes(promo, order.runnerPrices),
  };
}

/** How a code describes itself in one short phrase: "10% off", "₱200 off". */
export function describePromo(promo: PromoTerms): string {
  const type = asDiscountType(promo.discountType);
  switch (type) {
    case DISCOUNT_TYPES.PERCENTAGE:
      return `${formatBasisPoints(promo.discountValue)}% off`;
    case DISCOUNT_TYPES.FIXED:
      return `₱${formatPesos(promo.discountValue)} off`;
    case DISCOUNT_TYPES.FREE_DELIVERY:
      return 'Free delivery';
    case DISCOUNT_TYPES.BUY_X_GET_Y: {
      const buy = positive(promo.buyQuantity) ?? 0;
      const get = positive(promo.getQuantity) ?? 0;
      return `Register ${buy}, get ${get} free`;
    }
    default:
      return 'Discount';
  }
}

/**
 * The strings a person reads under a promotion: what it needs, and how long it
 * lasts.
 *
 * One list, used by the organizer's marketing table and by the badge a runner
 * sees on the event page, so the conditions an organizer set and the
 * conditions a runner is promised cannot be worded two different ways.
 */
export function promoConditions(promo: PromoTerms): string[] {
  const parts: string[] = [];
  const minRunners = positive(promo.minRunners);
  if (minRunners) parts.push(`${minRunners}+ runners`);
  const minSubtotal = positive(promo.minSubtotal);
  if (minSubtotal) parts.push(`₱${formatPesos(minSubtotal)}+ spend`);

  const from = asDate(promo.validFrom);
  const until = asDate(promo.validUntil);
  if (from && from.getTime() > Date.now()) parts.push(`from ${formatDay(from)}`);
  if (until) parts.push(`until ${formatDay(until)}`);

  return parts;
}

/** Basis points as a percentage a person reads: 1000 → "10", 1250 → "12.5". */
export function formatBasisPoints(basisPoints: number): string {
  const percent = (Number(basisPoints) || 0) / 100;
  return Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(2)));
}

/**
 * Why this code cannot be used on this order, or null when it can.
 *
 * One sentence naming the code and the condition it failed, per the project's
 * rule that validation says what is wrong: "SUMMER10 needs at least 5 runners
 * on one order — you have 3" is something a runner can act on, and "invalid
 * promo code" is not. The wizards show this under the code box and the
 * checkout routes return the identical string, because a code accepted on
 * screen and refused by the server would be worse than no code box at all.
 */
export function promoCodeError(
  promo: PromoTerms | null | undefined,
  order: OrderBasis & { deliveryChosen: boolean },
  typedCode: string,
): string | null {
  const cleaned = normalizePromoCode(typedCode);
  if (!cleaned) return null;

  if (!promo) return unknownPromoCodeError(cleaned);

  const type = asDiscountType(promo.discountType);
  if (!type) {
    return `${promo.code} can't be applied right now. Please contact the organizer.`;
  }

  if (isExhausted(promo)) {
    return promo.usageLimit === 1
      ? `${promo.code} is a single-use voucher and has already been claimed.`
      : `${promo.code} has already been used the maximum number of times.`;
  }

  const from = asDate(promo.validFrom);
  if (from && from.getTime() > Date.now()) {
    return `${promo.code} isn't active yet — it starts on ${formatDay(from)}.`;
  }

  const until = asDate(promo.validUntil);
  if (until && until.getTime() < Date.now()) {
    return `${promo.code} expired on ${formatDay(until)}.`;
  }

  const runners = order.runnerPrices.length;
  const minRunners = positive(promo.minRunners);
  if (minRunners && runners < minRunners) {
    return `${promo.code} needs at least ${minRunners} runner${minRunners === 1 ? '' : 's'} on one order — you have ${runners}.`;
  }

  const minSubtotal = positive(promo.minSubtotal);
  if (minSubtotal && order.subtotal < minSubtotal) {
    return `${promo.code} needs a subtotal of at least ₱${formatPesos(minSubtotal)} — yours is ₱${formatPesos(order.subtotal)}.`;
  }

  if (type === DISCOUNT_TYPES.FREE_DELIVERY && !order.deliveryChosen) {
    return `${promo.code} waives the delivery fee, and you chose to collect your race kit yourself. Switch to delivery in step 2 to use it.`;
  }

  if (type === DISCOUNT_TYPES.BUY_X_GET_Y) {
    const group = (positive(promo.buyQuantity) ?? 0) + (positive(promo.getQuantity) ?? 0);
    if (group > 0 && runners < group) {
      return `${promo.code} gives you ${positive(promo.getQuantity)} free for every ${positive(promo.buyQuantity)} registered, so it needs ${group} runners on one order — you have ${runners}.`;
    }
  }

  if (discountAmountFor(promo, order) <= 0) {
    return `${promo.code} takes nothing off this order.`;
  }

  return null;
}

/**
 * What a runner is told when the code they typed is not one of ours.
 *
 * Deliberately not "invalid code": the overwhelmingly likely cause is a typo
 * off a poster, and naming what was typed is what lets them see it. It also
 * says the box may be left empty, because a runner who was never given a code
 * should not think they are missing something.
 */
export function unknownPromoCodeError(code: string): string {
  return `We don't have a code called "${normalizePromoCode(code)}" for this event. Check the spelling, or leave the box empty.`;
}

/** Whether every redemption this code allows has been taken. */
export function isExhausted(promo: Pick<PromoTerms, 'usageLimit' | 'usageCount'>): boolean {
  const limit = positive(promo.usageLimit);
  return limit !== null && promo.usageCount >= limit;
}

/**
 * A code as it is stored and compared: uppercase, no surrounding space.
 *
 * Runners type codes off a poster with a stray space on the end about as often
 * as not, and a code is a label rather than a password — refusing "summer10"
 * because of its casing would be a refusal the runner cannot see the reason
 * for.
 */
export function normalizePromoCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

/** A code is a short label, not a sentence. Bounds what a public route accepts. */
export const MAX_PROMO_CODE_LENGTH = 32;

/**
 * Thrown by `redeemPromoCode` when the last redemption went to somebody else
 * between the summary being drawn and the write landing. Its message is
 * already the sentence the runner should read.
 */
export class PromoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromoUnavailableError';
  }
}

/**
 * Spends one redemption, inside the transaction that writes the registration.
 *
 * The same reasoning as `reserveSlots`: a usage cap checked before the write is
 * a cap two simultaneous orders both pass, and a single-use voucher that two
 * people redeem is exactly the failure the cap exists to prevent. So the row is
 * locked `FOR UPDATE` first, re-counted, and only then incremented.
 *
 * A code is spent when the order is *placed*, not when it is paid — the same
 * moment a slot is taken, and for the same reason. An unpaid PayMongo checkout
 * holds both until it is cleaned up; a voucher that only counted on payment
 * could be attached to any number of pending orders at once.
 */
export async function redeemPromoCode(
  tx: any,
  promoId: string,
  code: string,
): Promise<void> {
  // Tagged template rather than Prisma.sql: this module is imported by both
  // wizards, which are client components, and pulling @prisma/client into the
  // browser bundle to interpolate one id would be the same poor trade
  // order-ref.ts refused when it chose Web Crypto over node's.
  const locked: { usageLimit: number | null; usageCount: number }[] = await tx.$queryRaw`
    SELECT "usageLimit", "usageCount" FROM "PromoCode" WHERE "id" = ${promoId} FOR UPDATE`;

  const row = locked[0];
  if (!row) {
    throw new PromoUnavailableError(
      `${code} is no longer available. Remove it and try again — nothing has been charged.`,
    );
  }

  if (isExhausted(row)) {
    throw new PromoUnavailableError(
      row.usageLimit === 1
        ? `${code} was claimed by someone else while you were checking out. Remove it and try again — nothing has been charged.`
        : `${code} reached its usage limit while you were checking out. Remove it and try again — nothing has been charged.`,
    );
  }

  await tx.promoCode.update({
    where: { id: promoId },
    data: { usageCount: { increment: 1 } },
  });
}

function clamp(amount: number, ceiling: number): number {
  const value = Math.floor(Number(amount) || 0);
  if (value <= 0) return 0;
  return Math.min(value, Math.max(0, Math.floor(ceiling)));
}

function positive(value: number | null | undefined): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A date in the runner's own timezone. Manila rather than the server's UTC,
 * for the same reason `event-schedule.ts` insists on it: a code that expires at
 * midnight Manila must not read as expiring the previous evening.
 */
function formatDay(date: Date): string {
  // en-US, matching formatEventDay in event-schedule.ts — "31 January" and
  // "January 31" appearing on the same screen would look like two apps.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
