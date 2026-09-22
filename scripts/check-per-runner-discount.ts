import {
  DISCOUNT_TYPES,
  applyPromo,
  isExhausted,
  isPricedIn,
  limitCountsRunners,
  promoCodeError,
  redeemPromoCode,
  runnersDiscounted,
  runnersLeft,
  type PromoTerms,
} from '../src/lib/discount';

/**
 * A check of Batch 2 of MARKETING_DISCOUNTS_PLAN.md: PERCENTAGE and FIXED
 * codes actually working at checkout, not just pricing correctly in the
 * wizard.
 *
 * This exists because Batch 2 was marked done and verified while
 * `PER_RUNNER_CHECKOUT_READY` was still `false` — every PERCENTAGE/FIXED code
 * was refused by `promoCodeError` before checkout was ever reached, and the
 * wizards' "Only N discounted places were left" message quoted the promo's
 * total `usageLimit` instead of the runners actually discounted on this
 * order. Both are fixed in `discount.ts` and the two wizard clients; this
 * script pins the underlying arithmetic so neither regresses silently the
 * way it did the first time — same reasoning as
 * `check-category-price-math.ts`, and it touches no database.
 *
 * Run it with the alias `discount.ts` imports through, since jiti does not
 * read tsconfig paths:
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-per-runner-discount.ts
 *
 * Exits non-zero if anything disagrees.
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

async function checkThrows(label: string, fn: () => Promise<void>, wantMessage?: RegExp) {
  try {
    await fn();
    failures += 1;
    console.log(`FAIL  ${label}\n      wanted a throw, got none`);
  } catch (err: any) {
    const ok = !wantMessage || wantMessage.test(err.message ?? '');
    if (!ok) failures += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${label}`,
      ok ? '' : `\n      got "${err.message}" want to match ${wantMessage}`,
    );
  }
}

const TEN_K = 'cat-10k';
const TWENTY_ONE_K = 'cat-21k';
const THREE_K = 'cat-3k';
const categories = [
  { id: TEN_K, price: 120_000 },
  { id: TWENTY_ONE_K, price: 180_000 },
  { id: THREE_K, price: 25_000 },
];

function promoWith(overrides: Partial<PromoTerms>): PromoTerms {
  return {
    code: 'SUMMER20',
    discountType: DISCOUNT_TYPES.PERCENTAGE,
    discountValue: 20,
    usageLimit: null,
    usageCount: 0,
    validFrom: null,
    validUntil: null,
    buyQuantity: null,
    getQuantity: null,
    automatic: false,
    categoryIds: [],
    categoryNames: [],
    ...overrides,
  };
}

const order = (() => {
  // A group of five: three on the 10K, two on the 21K.
  const runnerCategories = [
    { categoryId: TEN_K, listPrice: 120_000 },
    { categoryId: TEN_K, listPrice: 120_000 },
    { categoryId: TEN_K, listPrice: 120_000 },
    { categoryId: TWENTY_ONE_K, listPrice: 180_000 },
    { categoryId: TWENTY_ONE_K, listPrice: 180_000 },
  ];
  const runnerPrices = runnerCategories.map(r => r.listPrice);
  const subtotal = runnerPrices.reduce((a, b) => a + b, 0);
  return { runnerPrices, runnerCategories, subtotal };
})();

// ── promoCodeError no longer blocks per-runner kinds at checkout ───────────
// This is the regression that shipped: PER_RUNNER_CHECKOUT_READY stayed
// false, so every PERCENTAGE/FIXED code was refused here before the rest of
// this script's scenarios could ever be reached by a real runner.
const freshCode = promoWith({ usageLimit: null, usageCount: 0 });
check(
  'a plain PERCENTAGE code is no longer refused as checkout-not-ready',
  promoCodeError(freshCode, order, freshCode.code),
  null,
);

// ── Plan example 1: 20% off, limited to 3 runners, group of 5 across 10K/21K
const limited3 = promoWith({ usageLimit: 3, usageCount: 0 });
const applied3 = applyPromo(limited3, order)!;

check('a per-runner discount is priced in', applied3.pricedIn, true);
check('isPricedIn agrees', isPricedIn(applied3.type), true);
check(
  // Both 21K runners (idx 3, 4) plus the most expensive-and-earliest of the
  // three tied 10K runners (idx 0) — ties go to the earlier runner.
  'the 3 most expensive entries are discounted (both 21K, then the earliest 10K)',
  applied3.salePriceByRunner,
  [96_000, null, null, 144_000, 144_000],
);
check(
  'runnersDiscounted matches the runners actually priced in',
  runnersDiscounted(limited3, order),
  3,
);
check('runnersLeft on a fresh 3-cap is 3', runnersLeft(limited3), 3);

// The bug: the wizard used to print the promo's *total* usageLimit here
// ("Only 3 discounted places were left" only ever matched by coincidence,
// because this example's code happens to be freshly minted). Re-run the same
// code after it already has 47 of its 50 uses spent, leaving 3 for this
// group of 5 — discountedIdxs.length must still be 3, but usageLimit is 50.
const partlyUsed = promoWith({ usageLimit: 50, usageCount: 47 });
const appliedPartlyUsed = applyPromo(partlyUsed, order)!;
const discountedOnPartlyUsed = appliedPartlyUsed.salePriceByRunner.filter(p => p !== null).length;
check(
  'places actually left on a partly-used 50-cap (not the total 50)',
  discountedOnPartlyUsed,
  3,
);
check(
  'the wizard fix must read this number, not discount.usageLimit (50)',
  discountedOnPartlyUsed !== appliedPartlyUsed.usageLimit,
  true,
);

// ── Plan example 2: ₱300 voucher on a group with a ₱250 3K ─────────────────
const voucherOrder = {
  runnerPrices: [25_000, 120_000],
  runnerCategories: [
    { categoryId: THREE_K, listPrice: 25_000 },
    { categoryId: TEN_K, listPrice: 120_000 },
  ],
  subtotal: 145_000,
};
const voucher = promoWith({
  code: 'GIFT300',
  discountType: DISCOUNT_TYPES.FIXED,
  discountValue: 30_000,
  usageLimit: 1,
  usageCount: 0,
});
const appliedVoucher = applyPromo(voucher, voucherOrder)!;
check(
  'a voucher covers the most expensive runner, capped at that entry',
  appliedVoucher.salePriceByRunner,
  [null, 90_000],
);
check('a voucher discounts exactly one runner', runnersDiscounted(voucher, voucherOrder), 1);

// ── Plan example 3: a code limited to the 10K on an order with no 10K ──────
const tenKOnly = promoWith({
  code: 'TENK10',
  categoryIds: [TEN_K],
  categoryNames: ['10K'],
});
const noTenKOrder = {
  runnerPrices: [180_000, 180_000],
  runnerCategories: [
    { categoryId: TWENTY_ONE_K, listPrice: 180_000 },
    { categoryId: TWENTY_ONE_K, listPrice: 180_000 },
  ],
  subtotal: 360_000,
};
check(
  'a category-restricted code is refused by name when nobody qualifies',
  promoCodeError(tenKOnly, noTenKOrder, tenKOnly.code),
  `${tenKOnly.code} is only for 10K runners.`,
);

// ── redeemPromoCode: claims the number of runners discounted, not 1 ────────
function fakeTx(initial: { usageLimit: number | null; usageCount: number; discountType: string }) {
  const state = { ...initial };
  return {
    state,
    async $queryRaw() {
      return [{ usageLimit: state.usageLimit, usageCount: state.usageCount, discountType: state.discountType }];
    },
    promoCode: {
      async update({ data }: any) {
        state.usageCount += data.usageCount.increment;
      },
    },
    promoCategoryPrice: { async updateMany() {} },
  };
}

{
  const tx = fakeTx({ usageLimit: 3, usageCount: 0, discountType: DISCOUNT_TYPES.PERCENTAGE });
  await redeemPromoCode(tx as any, 'promo-1', 'SUMMER20', new Map(), false, 3);
  check('redeeming 3 runners against a 3-cap spends exactly 3', tx.state.usageCount, 3);
}

{
  // Same 3-cap, but only 2 are left when the write actually lands (someone
  // else got there first) — a group of 3 trying to claim it must be refused
  // with a sentence in runners, not silently overspend the cap.
  const tx = fakeTx({ usageLimit: 3, usageCount: 1, discountType: DISCOUNT_TYPES.PERCENTAGE });
  await checkThrows(
    'redeeming more runners than are left throws, named in runners',
    () => redeemPromoCode(tx as any, 'promo-1', 'SUMMER20', new Map(), false, 3),
    /Only 2 more discounted places were left on SUMMER20, and you have 3 runners/,
  );
  check('the failed redemption does not touch usageCount', tx.state.usageCount, 1);
}

{
  // The older, order-counted kinds are unaffected: still +1 regardless of
  // how many runners are on the order.
  const tx = fakeTx({ usageLimit: 10, usageCount: 0, discountType: DISCOUNT_TYPES.CATEGORY_PRICE });
  await redeemPromoCode(tx as any, 'promo-2', 'EARLYBIRD', new Map(), false, 5);
  check('an order-counted kind still spends 1 no matter how many runners', tx.state.usageCount, 1);
}

// ── isExhausted / limitCountsRunners agree for the new kinds ───────────────
check('limitCountsRunners is true for PERCENTAGE', limitCountsRunners(DISCOUNT_TYPES.PERCENTAGE), true);
check('limitCountsRunners is true for FIXED', limitCountsRunners(DISCOUNT_TYPES.FIXED), true);
check('limitCountsRunners is false for CATEGORY_PRICE', limitCountsRunners(DISCOUNT_TYPES.CATEGORY_PRICE), false);
check(
  'a fully-claimed per-runner code reads as exhausted',
  isExhausted(promoWith({ usageLimit: 3, usageCount: 3 })),
  true,
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
