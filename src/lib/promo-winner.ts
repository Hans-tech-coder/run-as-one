import {
  DISCOUNT_TYPES,
  applyPromo,
  asDiscountType,
  categoryPriceSavings,
  normalizePromoCode,
  perRunnerSavings,
  promoCodeError,
  type AppliedDiscount,
  type OrderBasis,
  type PromoTerms,
} from '@/lib/discount';

/**
 * Which promotions an order gets: the one that takes off the most, or — where
 * the organizer allowed it on both — a price promotion and a group deal
 * together.
 *
 * Split out of `discount.ts`, which owns what *one* promotion is worth; this
 * owns the choice between several. Pure like it, because both wizards weigh
 * the same promotions the checkout routes do (via `resolveDiscount` in
 * promo-store.ts), and a summary that combined two promotions the server then
 * refused to combine would be the worst bug this feature could have.
 *
 * **Only one pairing exists** (owner, 2026-10-15): a price promotion —
 * `CATEGORY_PRICE`, `PERCENTAGE` or `FIXED`, the kinds that are priced in —
 * with a `BUY_X_GET_Y` group deal, both with `PromoCode.combinable` on. The
 * price promotion goes first, exactly as it would alone, and the deal then
 * frees the cheapest runners **at their sale prices**: six on a 10K at an
 * ₱900 early bird with "5+1 FREE" pay 5 × ₱900. Two price promotions still
 * never stack, and a pacer code never combines with anything.
 *
 * Because the price promotion walks the order unchanged, its seats, its
 * per-runner `promoPrice` snapshots and its redemption are exactly what they
 * would have been alone — a free runner still holds an early-bird seat. The
 * deal is spent as one order, as it always is.
 */

/** Whether this promotion is a price promotion that may take a group deal. */
function isCombinablePrice(promo: PromoTerms): boolean {
  if (promo.combinable !== true) return false;
  const type = asDiscountType(promo.discountType);
  return (
    type === DISCOUNT_TYPES.CATEGORY_PRICE ||
    type === DISCOUNT_TYPES.PERCENTAGE ||
    type === DISCOUNT_TYPES.FIXED
  );
}

/** Whether this promotion is a group deal that may go on a price promotion. */
function isCombinableDeal(promo: PromoTerms): boolean {
  return (
    promo.combinable === true &&
    asDiscountType(promo.discountType) === DISCOUNT_TYPES.BUY_X_GET_Y
  );
}

/**
 * The order as a price promotion leaves it: each runner at what they are
 * charged once its saving is off. From the same walk `applyPromo` priced the
 * order with, so the deal frees exactly the price the runner's line shows.
 */
function repricedOrder(promo: PromoTerms, order: OrderBasis): OrderBasis {
  const savings =
    asDiscountType(promo.discountType) === DISCOUNT_TYPES.CATEGORY_PRICE
      ? categoryPriceSavings(promo, order)
      : perRunnerSavings(promo, order);
  const runnerPrices = order.runnerPrices.map((price, index) =>
    Math.max(0, price - (savings[index] ?? 0)),
  );
  return {
    runnerPrices,
    runnerCategories: order.runnerCategories,
    subtotal: runnerPrices.reduce((sum, price) => sum + price, 0),
  };
}

/**
 * A price promotion and a group deal on one order, or null when the deal does
 * not apply once the prices have come down.
 *
 * The deal passes `promoCodeError` again on the repriced order, because "takes
 * nothing off" is a question about the prices it is actually freeing.
 */
function combine(
  price: PromoTerms,
  deal: PromoTerms,
  order: OrderBasis,
  at: number,
): AppliedDiscount | null {
  const first = applyPromo(price, order);
  if (!first) return null;

  const after = repricedOrder(price, order);
  if (promoCodeError(deal, after, deal.code, at)) return null;
  const second = applyPromo(deal, after);
  if (!second) return null;

  return {
    ...first,
    amount: first.amount + second.amount,
    freeRunners: second.freeRunners,
    combined: second,
  };
}

/**
 * The best of several promotions on this order, or null when none applies.
 *
 * One discount is given unless the organizer allowed two. Stacking promotions
 * nobody marked as combinable is a number the organizer never agreed to — an
 * early bird at 10% on top of a ₱200 code is a giveaway nobody planned — so
 * where more than one qualifies, the one that takes off the most wins and the
 * runner is told which. A combinable pairing (see the header) is one more
 * candidate, weighed by its total, and it wins only by taking off more than
 * either promotion alone.
 *
 * Ties go to the automatic one, because it is the promotion the organizer set
 * running rather than one a runner happened to be handed, and because leaving
 * a typed code unspent keeps it available for the next order.
 *
 * **A pacer code wins outright**, whatever the arithmetic says. It already
 * takes off the whole entry, so nothing can beat it on amount — but it may
 * also waive the admin fee, and that is worth money this comparison cannot
 * see. An automatic promotion that happened to tie would otherwise leave the
 * pacer paying a fee they were told was covered, and leave their single-use
 * code unspent besides. A pacer on somebody else's race is not a shopper
 * looking for the best deal; they were handed one specific thing.
 *
 * **A `FREE_ENTRY` promotion wins outright too**, for the same fee it waives
 * (`winsOutright`).
 *
 * `at` is the moment whose date windows count — now, unless a price lock asks
 * for another (`bestDiscountLocked` below).
 */
export function bestDiscount(
  promos: (PromoTerms | null | undefined)[],
  order: OrderBasis,
  at: number = Date.now(),
): AppliedDiscount | null {
  let best: AppliedDiscount | null = null;
  const eligible: PromoTerms[] = [];

  for (const promo of promos) {
    if (!promo) continue;
    // The same gate the wizard shows and the checkout route enforces, so a
    // promotion that fails a condition is simply not a candidate here.
    if (promoCodeError(promo, order, promo.code, at)) continue;

    const applied = applyPromo(promo, order);
    if (!applied) continue;
    eligible.push(promo);

    if (winsOutright(best)) continue;

    if (
      winsOutright(applied) ||
      !best ||
      applied.amount > best.amount ||
      (applied.amount === best.amount && applied.automatic && !best.automatic)
    ) {
      best = applied;
    }
  }

  if (winsOutright(best)) return best;

  for (const price of eligible.filter(isCombinablePrice)) {
    for (const deal of eligible.filter(isCombinableDeal)) {
      const both = combine(price, deal, order, at);
      if (both && (!best || both.amount > best.amount)) best = both;
    }
  }

  return best;
}

/**
 * The best discount for an order under a price lock (lib/price-lock.ts): the
 * larger of what it gets at `lockedAt` and what it gets now, or just now when
 * there is no lock.
 *
 * Both, not the lock alone, because the lock may never make an order dearer: a
 * promotion that started while the runner was typing still applies. Only the
 * date windows move with `lockedAt` — paused, usage, seats and group size are
 * the rows as they are now, so the lock holds a price and reserves nothing.
 *
 * The one function both wizards' summaries and `resolveDiscount` call, so the
 * total a runner is shown and the total the checkout charges cannot drift
 * apart. A tie goes to now, and a pacer code or a free entry wins outright
 * as in `bestDiscount`.
 */
export function bestDiscountLocked(
  promos: (PromoTerms | null | undefined)[],
  order: OrderBasis,
  lockedAt: number | null,
): AppliedDiscount | null {
  const now = bestDiscount(promos, order);
  if (lockedAt === null) return now;

  const locked = bestDiscount(promos, order, lockedAt);
  if (!locked) return now;
  if (!now) return locked;
  if (winsOutright(now)) return now;
  if (winsOutright(locked)) return locked;
  return locked.amount > now.amount ? locked : now;
}

/**
 * Whether this discount beats every other whatever the amounts say: a pacer
 * code, or a `FREE_ENTRY` promotion. Both are the whole entry, so nothing can
 * outbid them, and the admin fee one of them waives is money `amount` does
 * not see — a tie lost to an automatic promotion would charge the fee the
 * runner was told was covered.
 */
function winsOutright(applied: AppliedDiscount | null): boolean {
  return applied?.type === DISCOUNT_TYPES.PACER || applied?.type === DISCOUNT_TYPES.FREE_ENTRY;
}

/**
 * Whether the price lock is what decided the discount: `winner` is what
 * `bestDiscountLocked` chose, `now` is `bestDiscount` at now. The checkout
 * routes store `Registration.priceLockedAt` and log the order when it is, so
 * staff can explain an early-bird price on an order placed after the early
 * bird closed (the plan's §7). A tie goes to now in `bestDiscountLocked`, so equal
 * figures mean the lock changed nothing.
 */
export function lockChangedDiscount(
  winner: AppliedDiscount | null,
  now: AppliedDiscount | null,
): boolean {
  if (!winner) return false;
  return !now || winner.type !== now.type || winner.amount !== now.amount;
}

/**
 * The promotions inside a discount, each with its own share: one for a single
 * promotion, the price promotion and then the group deal for a combined one.
 *
 * What the order summaries iterate to print one line per promotion, and what
 * the checkout routes read to spend a redemption on each — so the line a
 * runner saw and the redemption spent are one reading.
 */
export function discountParts(applied: AppliedDiscount | null | undefined): AppliedDiscount[] {
  if (!applied) return [];
  if (!applied.combined) return [applied];
  return [
    {
      ...applied,
      amount: applied.amount - applied.combined.amount,
      freeRunners: [],
      combined: null,
    },
    applied.combined,
  ];
}

/** Whether this code is one of the promotions the discount is made of. */
export function discountIncludesCode(
  applied: AppliedDiscount | null | undefined,
  code: unknown,
): boolean {
  const cleaned = normalizePromoCode(code);
  return discountParts(applied).some(part => part.code === cleaned);
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
  const names = discountParts(winner)
    .map(part => part.code)
    .join(' + ');
  return `${normalizePromoCode(typedCode)} is worth less than the ${names} discount already on your order, so we kept the bigger one. Your code has not been used.`;
}
