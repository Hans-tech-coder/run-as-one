import { DISCOUNT_TYPES, asDiscountType, isPricedIn } from './discount';
import { shirtSizeUpchargeFor, type SizableCategory } from './shirt-size';

/**
 * One order's money, split across its runners, so that every per-runner column
 * summed down a spreadsheet comes to exactly what the order paid.
 *
 * The registrants export repeats the order's Discount and Total on every
 * runner of a group, because that is what an organizer matches a bank line
 * against. Staff building a revenue report could not sum those columns
 * without pivoting by Order Ref first: a group of six on a 5+1 deal read
 * ₱7,735 six times. This adds what each runner cost. The rules:
 *
 *  - **The stored order is the authority, and the split always adds up to
 *    it.** Each runner's entry is their category price plus their own shirt
 *    upcharge, the same line `runnerPrices` priced at checkout. Category prices
 *    are read live, though, and an organizer may have changed one since, or a
 *    runner may have moved category or been removed. When the live entries do
 *    not add up to the stored `subtotal`, the subtotal is shared out in
 *    proportion to them. The column then still sums to what was charged,
 *    which is what the report is for.
 *  - **A discount lands on the runners it was for.** A priced-in promotion
 *    (`isPricedIn`) is each runner's own `listPrice − promoPrice`. A buy-X-get-Y
 *    deal is the cheapest runners, last one first on a tie, the rule
 *    `freeRunnerIndexes` used to choose them. Those runners are found by
 *    walking up to the stored amount, so a promotion edited or deleted since
 *    changes nothing. Any other kind (a pacer's entry) follows the entries.
 *  - **The admin fee is split evenly**, because `platformFeeAfterDiscount`
 *    charged it per runner. **Delivery and transaction fees go on the first
 *    runner only.** The owner settled this on 2026-10-26: those are charged
 *    once per order, and putting them on one row avoids centavo fractions.
 *  - **A remainder centavo goes to the first runner it can**, so a split never
 *    loses or invents a centavo.
 *
 * Pure and free of Prisma, like `discount.ts`, so the rule can be checked
 * without a database (`scripts/check-runner-money.ts`).
 */

export interface MoneyRunner {
  /** Centavos. `Category.price` of the runner's current category, read live. */
  listPrice: number;
  /** `Runner.promoPrice`: the category price a priced-in promotion sold this seat at. */
  promoPrice: number | null;
  category: SizableCategory;
  singletSize: string;
}

/** The order's stored money, every amount in centavos. */
export interface MoneyOrder {
  subtotal: number;
  /** The whole discount, both promotions together on a combined order. */
  discountAmount: number;
  /** The buy-X-get-Y part of `discountAmount` on a combined order, else 0. */
  combinedDiscountAmount: number;
  discountType: string | null;
  platformFee: number;
  deliveryFee: number;
  transactionFee: number;
}

/** What one runner cost, in centavos. */
export interface RunnerMoney {
  /** Category price plus shirt upcharge, before any discount. */
  entryPrice: number;
  /** This runner's share of the order's discount. */
  discount: number;
  /** `entryPrice − discount`: what the entry itself was paid at. */
  registrationFee: number;
  adminFee: number;
  /** The order's delivery fee on its first runner, 0 on the rest. */
  deliveryFee: number;
  /** The order's transaction fee on its first runner, 0 on the rest. */
  transactionFee: number;
  /** All of the above. The runners of one order sum to its total. */
  total: number;
  /** An entry that cost something and was paid nothing: the free runner of a deal, a pacer. */
  freeEntry: boolean;
}

/**
 * `amount` shared out in proportion to `weights`, rounded down, with the
 * leftover centavos on the first runner carrying any weight. Evenly across
 * everyone when no weight is positive.
 */
export function allocate(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const positive = weights.map(weight => Math.max(0, weight));
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  const basis = total > 0 ? positive : weights.map(() => 1);
  const basisTotal = total > 0 ? total : weights.length;

  const shares = basis.map(weight => Math.floor((amount * weight) / basisTotal));
  const first = Math.max(0, basis.findIndex(weight => weight > 0));
  shares[first] += amount - shares.reduce((sum, share) => sum + share, 0);
  return shares;
}

/**
 * Which runners a buy-X-get-Y deal of `amount` made free: cheapest first, the
 * later runner first among equals, as many as it takes to reach the amount.
 */
function dealRunners(charged: number[], amount: number): Set<number> {
  const order = charged
    .map((price, index) => ({ price, index }))
    .sort((a, b) => (a.price === b.price ? b.index - a.index : a.price - b.price));
  const free = new Set<number>();
  let covered = 0;
  for (const { price, index } of order) {
    if (covered >= amount) break;
    free.add(index);
    covered += price;
  }
  return free;
}

/** The split, one entry per runner, in the order `runners` was given. */
export function splitOrderMoney(
  order: MoneyOrder,
  runners: MoneyRunner[],
  upchargePerRunner: number,
): RunnerMoney[] {
  if (runners.length === 0) return [];

  const natural = runners.map(
    runner =>
      runner.listPrice +
      shirtSizeUpchargeFor(
        { categoryId: runner.category.id, singletSize: runner.singletSize },
        [runner.category],
        upchargePerRunner,
      ),
  );
  const entries =
    natural.reduce((sum, entry) => sum + entry, 0) === order.subtotal
      ? natural
      : allocate(order.subtotal, natural);

  const type = asDiscountType(order.discountType);
  const deal =
    type === DISCOUNT_TYPES.BUY_X_GET_Y
      ? order.discountAmount
      : Math.min(order.combinedDiscountAmount, order.discountAmount);
  const priced = order.discountAmount - deal;

  const priceWeights = isPricedIn(type)
    ? runners.map(runner =>
        runner.promoPrice === null ? 0 : Math.max(0, runner.listPrice - runner.promoPrice),
      )
    : entries;
  const priceShares =
    priced > 0
      ? allocate(priced, priceWeights.some(weight => weight > 0) ? priceWeights : entries)
      : runners.map(() => 0);

  const charged = entries.map((entry, index) => entry - priceShares[index]);
  const free = deal > 0 ? dealRunners(charged, deal) : new Set<number>();
  const dealShares =
    deal > 0
      ? allocate(deal, charged.map((price, index) => (free.has(index) ? price : 0)))
      : runners.map(() => 0);

  const adminFees = allocate(order.platformFee, runners.map(() => 1));

  return runners.map((_, index) => {
    const entryPrice = entries[index];
    const discount = priceShares[index] + dealShares[index];
    const registrationFee = entryPrice - discount;
    const deliveryFee = index === 0 ? order.deliveryFee : 0;
    const transactionFee = index === 0 ? order.transactionFee : 0;
    return {
      entryPrice,
      discount,
      registrationFee,
      adminFee: adminFees[index],
      deliveryFee,
      transactionFee,
      total: registrationFee + adminFees[index] + deliveryFee + transactionFee,
      freeEntry: entryPrice > 0 && registrationFee <= 0,
    };
  });
}
