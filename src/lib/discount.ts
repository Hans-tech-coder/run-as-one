// Only `today()`, for the Manila calendar day. event-schedule's single Prisma
// import is a `import type`, so it is erased at build and this module stays
// safe for the wizards to import — see the note below.
import { today } from '@/lib/event-schedule';
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
 * The five kinds of discount. Stored UPPERCASE like every other coded column
 * in this schema.
 *
 * `CATEGORY_PRICE` and `BUY_X_GET_Y` are the race-shaped kinds: a second price
 * list for one race, and a deal on a group. `PERCENTAGE` and `FIXED` are the
 * number-off kinds, and they are **per runner, on the runner's entry line** —
 * the category price plus that runner's shirt upcharge, the same base
 * `runnerPrices` gives `BUY_X_GET_Y` — never off the order as a basket and
 * never off a fee. Which runners one of them reaches is decided by
 * `perRunnerSavings`, and its cap counts runners (`limitCountsRunners`).
 *
 * `PACER` is the odd one out, and deliberately so: the other four are
 * marketing, offered to whoever qualifies, and a pacer code is a free entry
 * handed to one named person so they will run the race for the organizer. It
 * is the only kind that can reach a fee, and the only one managed outside
 * `/admin/marketing`.
 */
export const DISCOUNT_TYPES = {
  /**
   * A second price list for one race: the 10K at ₱900 instead of ₱1,200 while
   * the 5K stays where it is. The amounts live in `categoryPrices`, one per
   * category, and the price each is discounted *from* is the category's own
   * price read live — see PromoCategoryPrice in schema.prisma.
   */
  CATEGORY_PRICE: 'CATEGORY_PRICE',
  /** "Register 5, the 6th is free." */
  BUY_X_GET_Y: 'BUY_X_GET_Y',
  /** 20% off each discounted runner's entry. `discountValue` is the whole percent. */
  PERCENTAGE: 'PERCENTAGE',
  /** ₱200 off each discounted runner's entry. `discountValue` is centavos. */
  FIXED: 'FIXED',
  /**
   * A free entry for one named pacer, in one category of one race
   * (`PACER_DISCOUNT_PLAN.md`). `discountValue` is unused: the discount is
   * always the whole entry line of the one runner it covers, and
   * `PromoCode.waiveAdminFee` says whether Run As One's admin fee goes with
   * it. It is the one kind that is not a promotion — it is given to a person,
   * which is why it is managed on the event's own Pacers screen and kept out
   * of `/admin/marketing`. See `src/lib/pacer.ts`.
   */
  PACER: 'PACER',
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
  CATEGORY_PRICE: 'Discounted category price',
  BUY_X_GET_Y: 'Buy X, get Y free',
  PERCENTAGE: 'Percentage off',
  FIXED: 'Fixed amount off',
  // Never offered in the marketing form's kind picker: a pacer code is created
  // on the event's Pacers screen, which knows the category it is locked to.
  // The label exists for the places that print a stored kind back.
  PACER: 'Pacer free entry',
};

/**
 * Whether this kind's `usageLimit` and `usageCount` count **runners** rather
 * than orders.
 *
 * True for the per-runner kinds: a group of five on a code limited to 50 uses
 * up five, because what the organizer is rationing is discounted places, and a
 * cap in orders could be claimed by 50 groups of ten. The older kinds keep
 * counting orders, unchanged. A voucher is a limit of 1 either way, and since a
 * per-runner voucher covers exactly one runner, one runner and one order mean
 * the same thing there.
 *
 * Written once because the checkout that spends the cap, the expiry sweep that
 * gives it back, the form that sets it and the table that reports it all have
 * to agree about what the number means.
 */
export function limitCountsRunners(discountType: unknown): boolean {
  const type = asDiscountType(discountType);
  return type === DISCOUNT_TYPES.PERCENTAGE || type === DISCOUNT_TYPES.FIXED;
}

/** The most a PERCENTAGE promotion may take off, in whole percent. */
export const MAX_PERCENT_OFF = 100;

/**
 * One category on a promotion's price list: which option, and what it costs
 * while the promotion runs.
 *
 * The price it is discounted *from* is deliberately absent — that is
 * `Category.price`, read live wherever this is used, so an organizer who later
 * raises the 10K cannot leave a promotion quoting a struck-through number the
 * event page no longer charges.
 */
export interface PromoCategoryPrice {
  categoryId: string;
  /** Centavos. Below the category's own price. */
  price: number;
  /**
   * How many **runners** may take this price, or null for as many as come.
   *
   * Runners rather than orders, unlike `PromoTerms.usageLimit`, and the
   * difference is the point: this counts seats at a price, the way
   * `Category.slotLimit` counts seats in a race, so a group of three eats
   * three of them. An early bird capped at 50 *orders* could be claimed by 50
   * groups of four.
   */
  usageLimit?: number | null;
  /** Runners already sold at this price. */
  usageCount?: number;
}

/** How many more runners this category can take at the promotion's price. */
export function categoryPriceRemaining(entry: PromoCategoryPrice): number | null {
  const limit = positive(entry.usageLimit);
  if (limit === null) return null;
  return Math.max(0, limit - Math.max(0, Math.floor(Number(entry.usageCount) || 0)));
}

/**
 * Which price box a refusal belongs under.
 *
 * One category's price is refused, not the list, so the message has to land on
 * that row rather than at the top of a panel holding five identical inputs. The
 * form builds the same key from the same id, which is why it is written here
 * once instead of as a template literal at each end.
 */
export function categoryPriceField(categoryId: string): string {
  return `categoryPrice:${categoryId}`;
}

/**
 * Which seat-count box a refusal belongs under.
 *
 * Its own key rather than sharing the price's, because the two boxes sit side
 * by side on one row and refuse for different reasons — "that price is not
 * lower" and "that is fewer seats than have already been sold" must not land
 * on each other.
 */
export function categorySeatsField(categoryId: string): string {
  return `categorySeats:${categoryId}`;
}

/** The row this module reasons about — the runner-facing half of a PromoCode. */
export interface PromoTerms {
  code: string;
  discountType: string;
  /**
   * PERCENTAGE: the whole percent, 1–100. FIXED: centavos off each discounted
   * runner's entry. 0 for the other two kinds, which read their amounts from
   * elsewhere.
   */
  discountValue: number;
  /**
   * The promotion's cap, or null for none. A **voucher is a limit of 1** —
   * that is what makes a batch single-use.
   *
   * Counted in runners for PERCENTAGE and FIXED and in orders for the older
   * kinds — see `limitCountsRunners`. A repricing promotion sets none here; it
   * is capped per category on its price rows instead.
   */
  usageLimit: number | null;
  usageCount: number;
  /** ISO strings once they have crossed the wire to a client component. */
  validFrom: string | Date | null;
  validUntil: string | Date | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  /**
   * CATEGORY_PRICE only: what each category costs while this runs. Optional
   * because every other kind has none, and absent rather than empty when a
   * query simply did not ask for them — `categoryPricesOf` normalises both.
   */
  categoryPrices?: PromoCategoryPrice[];
  /**
   * PERCENTAGE and FIXED only: the categories whose runners it discounts.
   * Empty or absent means every category. See PromoCategory in schema.prisma.
   */
  categoryIds?: string[];
  /**
   * The names of those same categories, in the event's own order, for the
   * sentences that name them: "10K and 21K only" under a promotion, and
   * "SUMMER10 is only for 10K and 21K runners." when an order has none of
   * them. Carried with the terms because this module is pure and cannot look
   * them up.
   */
  categoryNames?: string[];
  /**
   * True when this promotion needs no code — it applies on its own to any
   * order that meets its conditions. `code` is then its *name*, which is what
   * the event page badge and the order summary show.
   */
  automatic: boolean;
  /**
   * The organizer has switched it off. Distinct from every other reason a
   * promotion is not running: those are facts about dates and counts, this
   * is a decision, and it is the one that can be undone with one click.
   */
  paused?: boolean;
}

/** One runner's category, and what that category lists at today. */
export interface RunnerCategory {
  categoryId: string;
  /** Centavos, before any promotion. `Category.price`. */
  listPrice: number;
}

/** The order a code is being applied to. Every amount is centavos. */
export interface OrderBasis {
  /**
   * What each runner costs on their own — category price plus their own
   * large-size upcharge. From `runnerPrices` in shirt-size.ts, so BUY_X_GET_Y
   * takes off exactly what the free runner added.
   */
  runnerPrices: number[];
  /**
   * Which category each runner entered and what it lists at, positionally
   * aligned with `runnerPrices`. From `runnerCategories` in shirt-size.ts,
   * which derives both from the same participants array, so index i is the
   * same runner in both.
   *
   * CATEGORY_PRICE needs the list price separately from `runnerPrices`
   * because the two differ by the runner's own shirt upcharge, and a
   * promotion that repriced the 10K must not also give away the ₱150 a 3XL
   * singlet costs.
   */
  runnerCategories: RunnerCategory[];
  /** The goods total. Equal to the sum of runnerPrices. */
  subtotal: number;
}

/** A code that applies, and what it is worth on this order. */
export interface AppliedDiscount {
  code: string;
  type: DiscountType;
  /** Centavos taken off the order. Never more than what it applies to. */
  amount: number;
  /** How the discount describes itself in the summary: "10% off". */
  label: string;
  /** The usage limit of the promotion, for rendering partial application messages. */
  usageLimit: number | null;
  /** True when nobody had to type anything to get it. */
  automatic: boolean;
  /**
   * Which runners on the order are the free ones, by index into
   * `runnerPrices`. Only ever filled for BUY_X_GET_Y; empty otherwise. It is
   * what puts the FREE badge on the right card in step 1 and names the right
   * person in the summary.
   */
  freeRunners: number[];
  /**
   * Whether this discount is already inside the prices the runner is shown.
   *
   * A **sale is a price, not a deduction.** When a category is on promotion at
   * ₱900, the order summary says ₱900 on that runner's line and shows no
   * discount row at all — because that is how a sale reads everywhere else,
   * and quoting ₱1,200 with a ₱300 credit underneath invites the runner to
   * check arithmetic nobody asked them to do. Every other kind is the
   * opposite: the goods stay at list and the promotion is a line off the
   * order, so a typed code can be seen doing its job.
   *
   * **This changes nothing about the money.** The total is
   * `subtotal + fees − amount` either way, and the registration still stores
   * the list subtotal beside the amount taken off, so what a promotion cost is
   * still one subtraction away — see `Registration.discountAmount`.
   */
  pricedIn: boolean;
  /**
   * What each runner is charged for their category, by index into
   * `runnerPrices` — the promotion's price where they got a seat at it, and
   * the category's own price where they did not. Null for every runner when
   * the discount is not `pricedIn`.
   *
   * Per runner rather than per category because a promotion can run out
   * halfway through one order: a group of three on a 10K with two seats left
   * has two cards at ₱900 and one at ₱1,200, and a lookup keyed by category
   * could only ever answer with one of those two numbers.
   */
  salePriceByRunner: (number | null)[];
}

/**
 * Whether a discount of this kind is shown as a price or as a deduction.
 *
 * One function rather than a `=== 'CATEGORY_PRICE'` in each of the four places
 * that render a cost breakdown — both wizards' order summaries and both
 * emails. A breakdown that disagreed with the one beside it about whether the
 * discount had already been taken off would be the worst kind of bug here: it
 * would look like a different price.
 */
export function isPricedIn(discountType: unknown): boolean {
  const type = asDiscountType(discountType);
  // The per-runner kinds are priced in too: each discounted runner has their
  // own lower price, which is exactly what a sale price already is, and it is
  // what lets `Runner.promoPrice` record who was discounted.
  return type === DISCOUNT_TYPES.CATEGORY_PRICE || limitCountsRunners(type);
}

/**
 * What one runner's category costs them on this order, given the discount that
 * won.
 *
 * The list price unless a priced-in promotion had a seat left for this
 * particular runner. Taking the runner's index rather than their category is
 * the whole point: two runners on the same distance can be charged different
 * prices when the promotion runs out between them.
 */
export function chargedRunnerPrice(
  applied: AppliedDiscount | null | undefined,
  runnerIndex: number,
  listPrice: number,
): number {
  if (!applied?.pricedIn) return listPrice;
  const sale = applied.salePriceByRunner[runnerIndex];
  return sale !== null && sale !== undefined && sale < listPrice ? sale : listPrice;
}

/**
 * A promotion's price list, whether the query asked for it or not.
 *
 * Written once because four places read it — the arithmetic below, the phrase
 * the admin table prints, the slashed prices on the event page and the same
 * prices in the wizard's picker — and a promotion whose rows were not selected
 * must read as "no prices", never as a crash.
 */
export function categoryPricesOf(promo: PromoTerms): PromoCategoryPrice[] {
  return Array.isArray(promo.categoryPrices) ? promo.categoryPrices : [];
}

/**
 * How much this code takes off this order, in centavos.
 *
 * Assumes the code has already passed `promoCodeError` — this is the
 * arithmetic, not the gate. Every branch is capped at the thing it discounts,
 * so a ₱500 code on a ₱300 order takes off ₱300 and never turns the total
 * negative.
 *
 * **Fees are never discounted here**, by any kind. Every branch discounts the
 * goods — category prices and shirt upcharges — and nothing else: the admin
 * fee is the platform's, the delivery fee pays a courier and the transaction
 * fee is PayMongo's, so none of them is the organizer's to give away. A
 * percentage that quietly ate the platform's commission would be a bug nobody
 * notices until the month's payout, which is why `OrderBasis` does not even
 * carry the fees.
 *
 * **There is exactly one deliberate exception, and it is not in this
 * function.** A `PACER` code may waive Run As One's admin fee
 * (`PromoCode.waiveAdminFee`) — the one case where giving a fee away is the
 * company's own decision about its own money, which is why only the Super
 * Admin may set it (`promo:waive-fee`). The waiver travels as its own flag on
 * `AppliedDiscount` rather than as centavos added here, so this amount stays
 * what it has always been: money off the goods. Written down as an exception
 * because a reader who finds a fee waived somewhere must be able to find the
 * sentence that allowed it. See `PACER_DISCOUNT_PLAN.md`, Batch 2.
 */
export function discountAmountFor(promo: PromoTerms, order: OrderBasis): number {
  const type = asDiscountType(promo.discountType);
  if (!type) return 0;

  switch (type) {
    case DISCOUNT_TYPES.CATEGORY_PRICE:
      return clamp(
        categoryPriceSavings(promo, order).reduce((sum, saving) => sum + saving, 0),
        order.subtotal,
      );
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
    case DISCOUNT_TYPES.PERCENTAGE:
    case DISCOUNT_TYPES.FIXED:
      return clamp(
        perRunnerSavings(promo, order).reduce((sum, saving) => sum + saving, 0),
        order.subtotal,
      );
    // Batch 1 of PACER_DISCOUNT_PLAN.md creates pacer codes and the screen
    // that manages them; Batch 2 is what makes one spendable at checkout. Zero
    // until then, on purpose: a half-wired kind that took *something* off would
    // be a number nobody decided, and zero is the honest answer while the
    // pricing rule does not exist yet. `dev` is not promoted to `main` between
    // the two batches, so no runner can meet this state.
    case DISCOUNT_TYPES.PACER:
      return 0;
  }
}

/**
 * The categories a per-runner promotion is restricted to, or an empty list for
 * every category. Normalised once, like `categoryPricesOf`, so a query that did
 * not ask for them reads as "no restriction" rather than as a crash.
 */
export function promoCategoryIdsOf(promo: PromoTerms): string[] {
  return Array.isArray(promo.categoryIds) ? promo.categoryIds : [];
}

/**
 * How many more runners a per-runner promotion may discount, or null for as
 * many as come.
 *
 * Its `usageLimit` counts runners (`limitCountsRunners`), so what is left is the
 * limit less the runners already counted. A voucher is a limit of 1, which is
 * how "a voucher covers exactly one runner" falls out of the same rule as "a
 * shared code with 3 places left discounts 3 of a group of 5".
 */
export function runnersLeft(promo: Pick<PromoTerms, 'usageLimit' | 'usageCount'>): number | null {
  const limit = positive(promo.usageLimit);
  if (limit === null) return null;
  return Math.max(0, limit - Math.max(0, Math.floor(Number(promo.usageCount) || 0)));
}

/**
 * What each runner on this order saves under a PERCENTAGE or FIXED promotion,
 * by index — zero for everyone under any other kind.
 *
 * **The one walk every reading of these kinds goes through**: the amount
 * charged, the price on each runner's line, the runners counted against the
 * limit at checkout and the runners handed back when an order expires. Two
 * walks would be two answers to "who got the discount", and the money would
 * follow one while the receipt printed the other — the same reason
 * `categoryPriceSavings` exists for the repricing kind.
 *
 * 1. Keep only the runners in the promotion's categories (all of them when it
 *    names none).
 * 2. Sort them by entry line, most expensive first. On a tie the earlier
 *    runner comes first, so the discount lands on the card the group filled
 *    in first.
 * 3. Take as many as the promotion still allows (`runnersLeft`): 1 for a
 *    voucher, the places left for a capped shared code, all of them otherwise.
 *    A short code is split rather than refused, as `categoryPriceSavings`
 *    splits a nearly-gone sale.
 * 4. Each runner taken saves `min(entry, fixed)` or `floor(entry × % / 100)`,
 *    rounded down to the centavo.
 *
 * **Most expensive first** is the opposite of `BUY_X_GET_Y`'s cheapest-first,
 * and on purpose: a free runner is a gift an organizer defends by giving away
 * the smaller entry, but a limited discount is the group's to use, and it
 * should do the most it can for them.
 */
export function perRunnerSavings(promo: PromoTerms, order: OrderBasis): number[] {
  const type = asDiscountType(promo.discountType);
  const savings = order.runnerPrices.map(() => 0);
  if (!limitCountsRunners(type)) return savings;

  const value = positive(promo.discountValue);
  if (value === null) return savings;

  const only = new Set(promoCategoryIdsOf(promo));
  const left = runnersLeft(promo);

  const chosen = order.runnerPrices
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (entry <= 0) return false;
      if (only.size === 0) return true;
      const categoryId = order.runnerCategories[index]?.categoryId;
      return categoryId !== undefined && only.has(categoryId);
    })
    .sort((a, b) => (a.entry === b.entry ? a.index - b.index : b.entry - a.entry))
    .slice(0, left === null ? undefined : left);

  for (const { entry, index } of chosen) {
    savings[index] =
      type === DISCOUNT_TYPES.FIXED
        ? Math.min(entry, value)
        : Math.floor((entry * Math.min(value, MAX_PERCENT_OFF)) / 100);
  }
  return savings;
}

/**
 * How many runners on this order a per-runner promotion discounts: what the
 * checkout adds to `usageCount` for these kinds. Zero for every other kind.
 */
export function runnersDiscounted(promo: PromoTerms, order: OrderBasis): number {
  return perRunnerSavings(promo, order).filter(saving => saving > 0).length;
}

/**
 * What each runner on this order saves under a repricing promotion, by index.
 *
 * The one place the per-category caps are spent, so the amount charged, the
 * price printed on each runner's line and the seats claimed at checkout are
 * three readings of a single walk through the order. Zero for a runner whose
 * category is not repriced, or whose category has run out.
 *
 * **A short promotion is split rather than refused.** A group of three on a
 * 10K with two seats left pays the promotion price for two of them and the
 * full price for the third, which is what a runner expects from a sale that is
 * nearly gone — the alternative is telling a group of three that a promotion
 * with seats left applies to none of them.
 *
 * **The earlier runners get them.** Every runner in one category saves the
 * same amount, so the order changes nothing about the money; it decides only
 * which cards say the promotion price, and "the first two of you" is the one
 * rule a group can check against the form they filled in.
 */
export function categoryPriceSavings(promo: PromoTerms, order: OrderBasis): number[] {
  if (asDiscountType(promo.discountType) !== DISCOUNT_TYPES.CATEGORY_PRICE) {
    return order.runnerCategories.map(() => 0);
  }

  const priced = new Map(categoryPricesOf(promo).map(entry => [entry.categoryId, entry]));
  // Seats are spent as the walk goes, so the second runner on a category with
  // one left sees it gone. Infinity for an uncapped price, which needs no
  // special case anywhere below.
  const left = new Map(
    [...priced].map(([categoryId, entry]) => {
      const remaining = categoryPriceRemaining(entry);
      return [categoryId, remaining === null ? Number.POSITIVE_INFINITY : remaining];
    }),
  );

  return order.runnerCategories.map((runner, index) => {
    const entry = priced.get(runner.categoryId);
    if (!entry) return 0;

    const seats = left.get(runner.categoryId) ?? 0;
    if (seats <= 0) return 0;

    const saving = runner.listPrice - entry.price;
    if (saving <= 0) return 0;

    left.set(runner.categoryId, seats - 1);
    // Capped at what this runner is actually paying, so a stale row left over
    // from a category whose price has since fallen cannot discount the runner
    // beside them.
    return Math.min(saving, order.runnerPrices[index] ?? 0);
  });
}

/**
 * How many seats at the promotion price this order would claim, per category.
 *
 * What `redeemPromoCode` spends inside the checkout transaction. Derived from
 * the same walk that priced the order, so the seats taken and the money taken
 * off can never describe different orders.
 */
export function categorySeatsClaimed(
  promo: PromoTerms,
  order: OrderBasis,
): Map<string, number> {
  const claimed = new Map<string, number>();
  categoryPriceSavings(promo, order).forEach((saving, index) => {
    if (saving <= 0) return;
    const categoryId = order.runnerCategories[index]?.categoryId;
    if (!categoryId) return;
    claimed.set(categoryId, (claimed.get(categoryId) ?? 0) + 1);
  });
  return claimed;
}

/**
 * The one group a buy-X-get-Y promotion covers — `buy + get` runners — or null
 * for any other kind of promotion, and for one missing either number.
 *
 * **One group per registration.** "Register 5, get 1 free" covers six runners
 * on one order and no more: a group of seven is six on this registration and
 * one on another, each with its own receipt. Registering twelve on a single
 * order does not buy two free runners, because the promotion is a deal on a
 * group rather than a rate per head, and an organizer who wants to give away
 * two writes "register 10, get 2".
 *
 * This is the number step 1 stops a group at, the number the event page
 * promises, and the number the checkout pays out on, so the three cannot say
 * different things about the same promotion.
 */
export function promoGroupSize(promo: PromoTerms | null | undefined): number | null {
  if (!promo) return null;
  if (asDiscountType(promo.discountType) !== DISCOUNT_TYPES.BUY_X_GET_Y) return null;
  const buy = positive(promo.buyQuantity);
  const get = positive(promo.getQuantity);
  if (!buy || !get) return null;
  return buy + get;
}

/**
 * How many runners this order gets free under a buy-X-get-Y code.
 *
 * Whole groups only, and **one group per order**: five runners on a "register
 * 5, get 1" get nothing — the sixth is the free one, and there is no sixth —
 * and twelve get one free rather than two, per `promoGroupSize`. Step 1 will
 * not let a group past `buy + get` in the first place; this is the same rule
 * said again where the money is decided, so an order that arrived some other
 * way is worth what the wizard would have quoted.
 */
export function freeRunnerCount(promo: PromoTerms, runners: number): number {
  const group = promoGroupSize(promo);
  if (!group) return 0;
  return runners >= group ? (positive(promo.getQuantity) ?? 0) : 0;
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
 *
 * It goes quiet once the group is whole. The promotion covers `buy + get` and
 * no more (`promoGroupSize`), which is where step 1 stops accepting runners,
 * so an order sitting at six on a "register 5, get 1" has claimed everything
 * there is to claim — a second offer there would be inviting a group into a
 * seventh runner the promotion cannot pay for.
 */
export function freeSlotOffer(
  promo: PromoTerms | null | undefined,
  runners: number,
): { needed: number; free: number } | null {
  const group = promoGroupSize(promo);
  const buy = positive(promo?.buyQuantity);
  const get = positive(promo?.getQuantity);
  if (!group || !buy || !get) return null;

  // Below `buy` there is nothing to offer yet — they have not paid for the
  // free one — and at `group` the promotion is fully claimed and step 1 stops
  // accepting runners, so there is nothing left to offer either.
  if (runners < buy || runners >= group) return null;

  return { needed: group - runners, free: get };
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
  order: OrderBasis,
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
  const pricedIn = isPricedIn(type);
  // From the same walk that produced `amount`, so the price on a runner's line
  // and the money coming off the order cannot describe different orders.
  const savings =
    type === DISCOUNT_TYPES.CATEGORY_PRICE
      ? categoryPriceSavings(promo, order)
      : pricedIn
        ? perRunnerSavings(promo, order)
        : [];

  return {
    code: promo.code,
    type,
    amount,
    label: describePromo(promo),
    usageLimit: promo.usageLimit,
    automatic: promo.automatic === true,
    freeRunners: freeRunnerIndexes(promo, order.runnerPrices),
    pricedIn,
    salePriceByRunner: pricedIn
      ? order.runnerCategories.map((runner, index) =>
          // A category price, like every entry here. A per-runner discount
          // comes off the entry line, which also holds the runner's shirt
          // upcharge, so a discount bigger than the category price itself
          // floors this at zero rather than going negative.
          savings[index] > 0 ? Math.max(0, runner.listPrice - savings[index]) : null,
        )
      : order.runnerCategories.map(() => null),
  };
}

/** How a code describes itself in one short phrase: "10% off", "₱200 off". */
export function describePromo(promo: PromoTerms): string {
  const type = asDiscountType(promo.discountType);
  switch (type) {
    case DISCOUNT_TYPES.CATEGORY_PRICE: {
      const priced = categoryPricesOf(promo).length;
      if (priced === 0) return 'Discounted category price';
      // The prices themselves are not named here on purpose: this phrase is
      // read beside a promotion in a table and above a list of options on the
      // event page, and the second of those is already showing every number.
      return `Special price on ${priced} categor${priced === 1 ? 'y' : 'ies'}`;
    }
    case DISCOUNT_TYPES.BUY_X_GET_Y: {
      const buy = positive(promo.buyQuantity) ?? 0;
      const get = positive(promo.getQuantity) ?? 0;
      return `Register ${buy}, get ${get} free`;
    }
    case DISCOUNT_TYPES.PERCENTAGE:
      return `${positive(promo.discountValue) ?? 0}% off`;
    case DISCOUNT_TYPES.FIXED:
      return `₱${formatPesoAmount(positive(promo.discountValue) ?? 0)} off`;
    // No number to quote: a pacer code is the whole entry, every time.
    case DISCOUNT_TYPES.PACER:
      return 'Free pacer entry';
    default:
      return 'Discount';
  }
}

/**
 * Why a promotion is not running right now, or ACTIVE when it is.
 *
 * Five states, and an organizer glancing at the marketing table has to be
 * able to tell them apart, because three of them are their own doing and two
 * are not. The order matters: a paused promotion is paused whatever its dates
 * say, since that is the switch they just flipped and the one they will look
 * for; a promotion that has been fully claimed is finished even if its window
 * is still open.
 *
 * This is the same rule `promoCodeError` gates on, so a badge saying EXPIRED
 * and a runner being told the code still works is not a state this app can
 * reach. `USED_UP` covers both shapes of cap — a spent order limit, and a
 * repricing promotion whose every category has filled; see `isExhausted`.
 */
export type PromoStatus = 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP';

export function promoStatus(promo: PromoTerms): PromoStatus {
  if (promo.paused) return 'PAUSED';
  if (isExhausted(promo)) return 'USED_UP';

  const from = asDate(promo.validFrom);
  if (from && from.getTime() > Date.now()) return 'SCHEDULED';

  const until = asDate(promo.validUntil);
  if (until && until.getTime() < Date.now()) return 'EXPIRED';

  return 'ACTIVE';
}

/** What each state is called, and the badge tone it wears (see Admin.css). */
export const PROMO_STATUS_LABELS: Record<PromoStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  SCHEDULED: 'Scheduled',
  EXPIRED: 'Expired',
  USED_UP: 'Fully Used',
};

/**
 * Green only for a promotion that is actually running. Amber for one that is
 * simply waiting for its start date and needs nobody, which is exactly what
 * the `pending` tone means everywhere else in the admin. Neutral for the three
 * that are neither good news nor a warning — a fact, or a decision already
 * taken.
 */
export const PROMO_STATUS_TONES: Record<PromoStatus, 'success' | 'pending' | 'neutral'> = {
  ACTIVE: 'success',
  PAUSED: 'neutral',
  SCHEDULED: 'pending',
  EXPIRED: 'neutral',
  USED_UP: 'neutral',
};

/**
 * How close to its last day a running promotion has to be before the admin
 * says so. Three days is a working week's notice: long enough to extend it,
 * print more posters or decide to let it end, short enough that it is not
 * warning about something a fortnight away on every screen.
 */
export const PROMO_ENDING_SOON_DAYS = 3;

/**
 * "Ends tomorrow", for a promotion that is running and about to stop — or
 * null, which is most of them.
 *
 * The marketing table's Status column is honest about the five states but says
 * nothing until one of them has already happened, so the first an organizer
 * hears of a promotion ending is the word EXPIRED beside it. This is the
 * warning, and it is **in-app only**: an email about it would cost a recipient
 * against a free-tier ceiling of 100 a day (§10) to tell somebody something
 * their own dashboard can show them.
 *
 * Counted in Manila calendar days rather than in hours, because that is what
 * the organizer typed — a code ending "on the 30th" ends today on the 30th
 * however many hours are left of it, and rounding 20 hours to "in 1 day" would
 * be the app disagreeing with the date on its own screen.
 */
export function promoEndingSoon(promo: PromoTerms): string | null {
  // Only a promotion that is actually running: a paused or exhausted one is
  // not about to end, it has already stopped, and its badge says so.
  if (promoStatus(promo) !== 'ACTIVE') return null;

  const until = asDate(promo.validUntil);
  if (!until) return null;

  const days = manilaDaysUntil(until);
  if (days === null || days < 0 || days > PROMO_ENDING_SOON_DAYS) return null;
  if (days === 0) return 'Ends today';
  if (days === 1) return 'Ends tomorrow';
  return `Ends in ${days} days`;
}

/** Whole Manila days from today to that instant's Manila day. */
function manilaDaysUntil(date: Date): number | null {
  // Both ends flattened to their Manila calendar day and compared as plain
  // UTC midnights: subtracting the instants themselves would make a window
  // closing at 23:59 tonight read as "in 0 days" only after lunch.
  const from = Date.parse(`${today()}T00:00:00Z`);
  const to = Date.parse(`${today(date)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * The strings a person reads under a promotion: what it needs, and how long it
 * lasts.
 *
 * There are no order minimums to list. What a promotion can say about itself
 * is the group size a buy-X-get-Y needs, the categories and the runner cap of
 * a per-runner discount, and its window of dates.
 *
 * One list, used by the organizer's marketing table and by the badge a runner
 * sees on the event page, so the conditions an organizer set and the
 * conditions a runner is promised cannot be worded two different ways.
 */
export function promoConditions(promo: PromoTerms): string[] {
  const parts: string[] = [];

  // A group deal states its own size, since nothing else on the row does.
  // Exactly that many, not "6+": one registration covers one group, so a
  // seventh runner belongs on a second order rather than earning more.
  const group = promoGroupSize(promo);
  if (group) parts.push(`${group} runners on one order`);

  // A per-runner discount says who it is for and how many places it has.
  if (limitCountsRunners(promo.discountType)) {
    const names = promo.categoryNames ?? [];
    if (promoCategoryIdsOf(promo).length > 0 && names.length > 0) {
      parts.push(`${joinNames(names)} only`);
    }
    const limit = positive(promo.usageLimit);
    if (limit !== null) parts.push(`${limit} runner${limit === 1 ? '' : 's'}`);
  }

  const from = asDate(promo.validFrom);
  const until = asDate(promo.validUntil);
  if (from && from.getTime() > Date.now()) parts.push(`from ${formatDay(from)}`);
  if (until) parts.push(`until ${formatDay(until)}`);

  return parts;
}

/**
 * What one option costs while a promotion is running: its own price, and the
 * lower one to show beside it.
 */
export interface CategorySalePrice {
  /** `Category.price` — the number that gets struck through. */
  listPrice: number;
  /** What the runner actually pays for this option. Always below listPrice. */
  salePrice: number;
  /** The promotion doing it, by name, so a page can credit it. */
  promoName: string;
  /**
   * Seats left at this price, or null when the promotion set no cap.
   *
   * Always above zero — a category with none left is not on sale, so it never
   * reaches this map at all. What the "8 left at this price" chip counts.
   */
  remaining: number | null;
}

/**
 * The struck-through prices for one race, keyed by category.
 *
 * The event page, the wizard's option picker and its poster lightbox all show
 * a price per category, and all three have to slash the same ones — so the
 * rule is written here rather than three times, next to the arithmetic that
 * charges for it. A category with no entry is simply at its own price.
 *
 * **Only promotions that are actually running**, through `promoStatus` rather
 * than a re-expressed set of date checks, because half of that rule copied
 * into a page is how a slashed price starts advertising something the checkout
 * will not honour. And only `automatic` ones: a code is the organizer's to
 * publish where they choose, and a price list is the most public thing a
 * promotion can be.
 *
 * Where two promotions reprice the same category, the **cheaper** wins, which
 * matches `bestDiscount` giving the order the largest discount it qualifies
 * for. A promotion quoting a price at or above the category's own is ignored
 * outright: there is nothing to slash, and drawing a line through ₱1,200 to
 * show ₱1,200 is worse than showing nothing.
 */
export function categorySalePrices(
  promos: readonly PromoTerms[],
  categories: readonly { id: string; price: number }[],
): Map<string, CategorySalePrice> {
  const sale = new Map<string, CategorySalePrice>();
  const listPrices = new Map(categories.map(category => [category.id, category.price]));

  for (const promo of promos) {
    if (!promo.automatic) continue;
    if (asDiscountType(promo.discountType) !== DISCOUNT_TYPES.CATEGORY_PRICE) continue;
    if (promoStatus(promo) !== 'ACTIVE') continue;

    for (const entry of categoryPricesOf(promo)) {
      const listPrice = listPrices.get(entry.categoryId);
      if (listPrice === undefined || entry.price >= listPrice) continue;

      // A category whose seats have gone is simply back at its own price. It
      // is dropped here rather than shown struck through with "0 left",
      // because a price nobody can still get is not a price.
      const remaining = categoryPriceRemaining(entry);
      if (remaining !== null && remaining <= 0) continue;

      const existing = sale.get(entry.categoryId);
      if (existing && existing.salePrice <= entry.price) continue;

      sale.set(entry.categoryId, {
        listPrice,
        salePrice: entry.price,
        promoName: promo.code,
        remaining,
      });
    }
  }

  return sale;
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
  order: OrderBasis,
  typedCode: string,
): string | null {
  const cleaned = normalizePromoCode(typedCode);
  if (!cleaned) return null;

  if (!promo) return unknownPromoCodeError(cleaned);

  const type = asDiscountType(promo.discountType);
  if (!type) {
    return `${promo.code} can't be applied right now. Please contact the organizer.`;
  }

  // The organizer switched it off. Deliberately vague about *why* — that is
  // between them and their own reasons — but not vague about the fact, and it
  // does not blame the runner for a code that was real when they were given it.
  if (promo.paused) {
    return `${promo.code} is not being accepted at the moment. Contact the organizer if you were given it.`;
  }

  if (isExhausted(promo)) {
    if (promo.usageLimit === 1) {
      return `${promo.code} is a single-use voucher and has already been claimed.`;
    }
    return limitCountsRunners(type)
      ? `${promo.code} has already been given to as many runners as it allows.`
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

  const group = promoGroupSize(promo);
  if (group && runners < group) {
    return `${promo.code} gives you ${positive(promo.getQuantity)} free when ${positive(promo.buyQuantity)} register, so it needs ${group} runners on one order — you have ${runners}.`;
  }

  // A per-runner discount restricted to categories nobody on this order
  // entered. Named, because "takes nothing off" would leave the group guessing
  // which distance it was for.
  const only = promoCategoryIdsOf(promo);
  if (limitCountsRunners(type) && only.length > 0) {
    const inScope = order.runnerCategories.some(runner => only.includes(runner.categoryId));
    if (!inScope) {
      const names = promo.categoryNames ?? [];
      return names.length > 0
        ? `${promo.code} is only for ${joinNames(names)} runners.`
        : `${promo.code} is only for runners in certain categories, and nobody on this order is in one.`;
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

/**
 * Whether every redemption this promotion allows has been taken.
 *
 * Two shapes of cap, because a repricing promotion is limited per category
 * rather than per order: 50 seats on the 10K and 30 on the 5K are two
 * decisions, and one `usageLimit` could only hold one of them. Such a
 * promotion is finished when **every** category it reprices has filled — while
 * one still has a seat, the promotion is still doing something for somebody,
 * and calling it Fully Used would take it off the event page early.
 *
 * A promotion with no caps of any kind is never exhausted, which is the same
 * answer this gave before either kind existed.
 *
 * The order cap needs no special case for the per-runner kinds: their
 * `usageLimit` and `usageCount` both count runners (`limitCountsRunners`), so
 * the one comparison answers "every discounted place is gone" for them and
 * "every redemption is gone" for the older kinds.
 */
export function isExhausted(
  promo: Pick<PromoTerms, 'usageLimit' | 'usageCount' | 'categoryPrices'>,
): boolean {
  const capped = categoryPricesOf(promo as PromoTerms).filter(
    entry => categoryPriceRemaining(entry) !== null,
  );
  if (capped.length > 0) {
    return capped.every(entry => (categoryPriceRemaining(entry) ?? 0) <= 0);
  }

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
 *
 * A repricing promotion spends **seats as well as a redemption**: its caps are
 * per category and counted in runners, so a group of three takes three of
 * them. Those are locked and re-counted here too, and the categories are
 * visited in id order so two orders on the same promotion cannot deadlock —
 * exactly what `reserveSlots` does with a category's own slots.
 */
export async function redeemPromoCode(
  tx: any,
  promoId: string,
  code: string,
  /**
   * Seats to claim per category, from `categorySeatsClaimed` — empty for every
   * kind but a repricing promotion. Passed in rather than recomputed here so
   * the seats spent are the ones the order was actually priced with.
   */
  seats: Map<string, number> = new Map(),
  /**
   * Whether the promotion applies on its own. It changes only what the runner
   * is told to do next: a typed code can be removed and the order retried, but
   * nobody can remove an automatic promotion — the page has to be reloaded so
   * the summary is priced without it, and telling them to "remove it" would
   * send them looking for a button that does not exist.
   */
  automatic = false,
  /** 
   * The number of runners receiving the discount. Used only when 
   * limitCountsRunners(type) is true.
   */
  runnersClaimed = 1,
): Promise<void> {
  const retry = automatic
    ? 'Reload the page to see your updated total — nothing has been charged.'
    : 'Remove it and try again — nothing has been charged.';
  // Tagged template rather than Prisma.sql: this module is imported by both
  // wizards, which are client components, and pulling @prisma/client into the
  // browser bundle to interpolate one id would be the same poor trade
  // order-ref.ts refused when it chose Web Crypto over node's.
  const locked: { usageLimit: number | null; usageCount: number; discountType: string }[] = await tx.$queryRaw`
    SELECT "usageLimit", "usageCount", "discountType" FROM "PromoCode" WHERE "id" = ${promoId} FOR UPDATE`;

  const row = locked[0];
  if (!row) {
    throw new PromoUnavailableError(
      `${code} is no longer available. ${retry}`,
    );
  }

  const claimCount = limitCountsRunners(row.discountType) ? runnersClaimed : 1;

  // The order cap, where there is one. A repricing promotion sets none — its
  // limits are the per-category seats below — so this is skipped for it.
  if (row.usageLimit !== null) {
    const left = row.usageLimit - row.usageCount;
    if (left < claimCount) {
      if (limitCountsRunners(row.discountType)) {
        throw new PromoUnavailableError(
          left <= 0
            ? `${code} ran out while you were checking out. ${retry}`
            : `Only ${left} more discounted place${left === 1 ? '' : 's'} were left on ${code}, and you have ${claimCount} runners using it. ${retry}`
        );
      } else {
        throw new PromoUnavailableError(
          row.usageLimit === 1
            ? `${code} was claimed by someone else while you were checking out. ${retry}`
            : `${code} reached its usage limit while you were checking out. ${retry}`,
        );
      }
    }
  }

  // The seats at the promotion price, claimed the way reserveSlots claims a
  // category's own slots: locked first, re-counted, then spent. A cap checked
  // when the summary was drawn is a cap two simultaneous groups both pass, and
  // the whole point of a capped early bird is that it cannot be oversold.
  for (const categoryId of [...seats.keys()].sort()) {
    const wanted = seats.get(categoryId) ?? 0;
    if (wanted <= 0) continue;

    // Ordered by category id above, so two orders on the same promotion always
    // take these rows in the same order and cannot deadlock on each other —
    // the same reason reserveSlots sorts before locking.
    const held: { usageLimit: number | null; usageCount: number }[] = await tx.$queryRaw`
      SELECT "usageLimit", "usageCount" FROM "PromoCategoryPrice"
      WHERE "promoCodeId" = ${promoId} AND "categoryId" = ${categoryId} FOR UPDATE`;

    const seat = held[0];
    // The price row is gone, which means the promotion was edited mid-checkout
    // and this order was priced against terms that no longer exist.
    if (!seat) {
      throw new PromoUnavailableError(
        `${code} changed while you were checking out. ${retry}`,
      );
    }

    if (seat.usageLimit === null) continue;

    const left = seat.usageLimit - seat.usageCount;
    if (left < wanted) {
      // Named in runners, because that is what ran out and what the group can
      // act on: they can still register, just not all at the promotion price.
      throw new PromoUnavailableError(
        left <= 0
          ? `${code} ran out at that price while you were checking out. ${retry}`
          : `Only ${left} more runner${left === 1 ? '' : 's'} can still get the ${code} price, and you have ${wanted} on it. ${retry}`,
      );
    }

    await tx.promoCategoryPrice.updateMany({
      where: { promoCodeId: promoId, categoryId },
      data: { usageCount: { increment: wanted } },
    });
  }

  await tx.promoCode.update({
    where: { id: promoId },
    data: { usageCount: { increment: claimCount } },
  });
}

function clamp(amount: number, ceiling: number): number {
  const value = Math.floor(Number(amount) || 0);
  if (value <= 0) return 0;
  return Math.min(value, Math.max(0, Math.floor(ceiling)));
}

/**
 * Pesos for a phrase rather than a receipt: "₱200 off", but "₱199.50 off".
 * The trailing .00 that `formatPesos` rightly prints on an amount due is noise
 * in the name of a discount.
 */
function formatPesoAmount(centavos: number): string {
  const full = formatPesos(centavos);
  return full.endsWith('.00') ? full.slice(0, -3) : full;
}

/** "10K", "10K and 21K", "5K, 10K and 21K". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
