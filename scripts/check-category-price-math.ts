import {
  DISCOUNT_TYPES,
  applyPromo,
  bestDiscount,
  categoryPriceRemaining,
  categorySalePrices,
  categorySeatsClaimed,
  chargedRunnerPrice,
  isExhausted,
  isPricedIn,
  type PromoTerms,
} from '../src/lib/discount';

/**
 * A check of the invariants a category-price promotion can break silently.
 *
 * The order summary prints its line items and its total from two different
 * places: each runner's line comes from `chargedRunnerPrice`, while the total
 * comes from `subtotal + fees − discountAmount`. If those two ever stop
 * agreeing, the runner is shown a breakdown that does not add up to the amount
 * they are charged — and nothing else in the app would catch it, because both
 * numbers are individually plausible.
 *
 * The per-category seat caps add a second one: the seats an order claims at
 * checkout must be exactly the seats it was priced with, or a capped early
 * bird oversells or undersells itself by the difference.
 *
 * There is no test runner in this project, so this is a script rather than a
 * spec. It touches no database and needs no environment; it is pure arithmetic
 * against `lib/discount.ts`.
 *
 * Run it with the alias `discount.ts` imports through, since jiti does not read
 * tsconfig paths:
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-category-price-math.ts
 *
 *   bash:
 *     JITI_ALIAS='{"@/":"'"$PWD"'/src/"}' npx jiti scripts/check-category-price-math.ts
 *
 * Exits non-zero if anything disagrees, so it can be wired into CI later.
 */

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}`,
    ok ? '' : `\n      got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`,
  );
}

const TEN_K = 'cat-10k';
const FIVE_K = 'cat-5k';
const categories = [
  { id: TEN_K, price: 120_000 },
  { id: FIVE_K, price: 80_000 },
];

function promoWith(categoryPrices: PromoTerms['categoryPrices']): PromoTerms {
  return {
    code: 'EARLY BIRD',
    discountType: DISCOUNT_TYPES.CATEGORY_PRICE,
    discountValue: 0,
    usageLimit: null,
    usageCount: 0,
    validFrom: null,
    validUntil: null,
    buyQuantity: null,
    getQuantity: null,
    automatic: true,
    categoryPrices,
  };
}

// Three runners: two on the 10K (the second in a 4XL shirt, +150) and one on
// the 5K, which this promotion does not reprice.
const upcharge = 15_000;
const runnerCategories = [
  { categoryId: TEN_K, listPrice: 120_000 },
  { categoryId: TEN_K, listPrice: 120_000 },
  { categoryId: FIVE_K, listPrice: 80_000 },
];
const runnerPrices = [120_000, 120_000 + upcharge, 80_000];
const subtotal = runnerPrices.reduce((a, b) => a + b, 0);
const order = { runnerPrices, runnerCategories, subtotal };

/** The invariant: the lines the summary prints must reconcile with the total. */
function reconciles(applied: ReturnType<typeof applyPromo>) {
  const lines = runnerCategories.map((runner, index) =>
    chargedRunnerPrice(applied, index, runner.listPrice),
  );
  return lines.reduce((a, b) => a + b, 0) + upcharge === subtotal - (applied?.amount ?? 0);
}

// ── Uncapped ────────────────────────────────────────────────────────────────
const uncapped = promoWith([{ categoryId: TEN_K, price: 90_000 }]);
const open = applyPromo(uncapped, order)!;

check('both 10K runners are repriced, the 5K is not', open.amount, 2 * 30_000);
check('a sale is priced in', open.pricedIn, true);
check('isPricedIn agrees with the flag', isPricedIn(open.type), true);
check('the summary lines reconcile with the total', reconciles(open), true);
check('an untouched category keeps its own price', chargedRunnerPrice(open, 2, 80_000), 80_000);
check('it claims one seat per repriced runner', [...categorySeatsClaimed(uncapped, order)], [[TEN_K, 2]]);

// ── Capped short: two runners want it, one seat left ────────────────────────
const oneLeft = promoWith([
  { categoryId: TEN_K, price: 90_000, usageLimit: 50, usageCount: 49 },
]);
const short = applyPromo(oneLeft, order)!;

check('only the remaining seat is discounted', short.amount, 30_000);
check('the earlier runner gets it', chargedRunnerPrice(short, 0, 120_000), 90_000);
check('the later runner pays list', chargedRunnerPrice(short, 1, 120_000), 120_000);
check('a short promotion still reconciles', reconciles(short), true);
check('it claims only the seat it used', [...categorySeatsClaimed(oneLeft, order)], [[TEN_K, 1]]);
check('one seat remains before the order', categoryPriceRemaining(oneLeft.categoryPrices![0]), 1);

// ── Capped out: nothing left ────────────────────────────────────────────────
const soldOut = promoWith([
  { categoryId: TEN_K, price: 90_000, usageLimit: 50, usageCount: 50 },
]);
check('a filled category discounts nothing', applyPromo(soldOut, order), null);
check('and the promotion reads as used up', isExhausted(soldOut), true);
check('it is dropped from the public price list', [...categorySalePrices([soldOut], categories).keys()], []);

// ── Partly filled: one category out, one still open ─────────────────────────
const mixed = promoWith([
  { categoryId: TEN_K, price: 90_000, usageLimit: 50, usageCount: 50 },
  { categoryId: FIVE_K, price: 60_000, usageLimit: 30, usageCount: 0 },
]);
check('a promotion with one category left is not used up', isExhausted(mixed), false);
check('only the open category is slashed', [...categorySalePrices([mixed], categories).keys()], [FIVE_K]);
check(
  'and it carries what is left, for the chip',
  categorySalePrices([mixed], categories).get(FIVE_K)?.remaining,
  30,
);

// ── The other kind is unchanged ─────────────────────────────────────────────
const group: PromoTerms = {
  ...uncapped,
  code: 'GROUP6',
  discountType: DISCOUNT_TYPES.BUY_X_GET_Y,
  buyQuantity: 2,
  getQuantity: 1,
  categoryPrices: [],
};
const groupApplied = applyPromo(group, order)!;
check('a group deal is not priced in', groupApplied.pricedIn, false);
check(
  'a group deal leaves every runner line at list',
  runnerCategories.map((r, i) => chargedRunnerPrice(groupApplied, i, r.listPrice)),
  [120_000, 120_000, 80_000],
);
check('and it claims no seats', [...categorySeatsClaimed(group, order)], []);

// ── Only one discount is ever given ─────────────────────────────────────────
const winner = bestDiscount([uncapped, group], order);
check(
  'the larger of the two wins',
  winner?.code,
  open.amount >= groupApplied.amount ? 'EARLY BIRD' : 'GROUP6',
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
