import { DISCOUNT_TYPES, chargedRunnerPrice, type OrderBasis, type PromoTerms } from '../src/lib/discount';
import {
  bestDiscount,
  discountIncludesCode,
  discountParts,
  outshoneByMessage,
} from '../src/lib/promo-winner';

/**
 * A check of combining a price promotion with a group deal
 * (`lib/promo-winner.ts`): that it only happens when both are combinable,
 * that the deal frees runners at their sale price, and that the parts add up
 * to the whole — the summary prints the parts, the charge uses the whole.
 *
 * Pure arithmetic, like `check-category-price-math.ts`. Run it the same way:
 *
 *   bash:
 *     JITI_ALIAS='{"@/":"'"$PWD"'/src/"}' npx jiti scripts/check-combined-promos.ts
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

const base = {
  discountValue: 0,
  usageLimit: null,
  usageCount: 0,
  validFrom: null,
  validUntil: null,
  buyQuantity: null,
  getQuantity: null,
  automatic: true,
};

const earlyBird = (combinable: boolean, seats: number | null = null): PromoTerms => ({
  ...base,
  code: 'EARLY BIRD',
  discountType: DISCOUNT_TYPES.CATEGORY_PRICE,
  combinable,
  categoryPrices: [
    { categoryId: TEN_K, price: 90_000, usageLimit: seats, usageCount: 0 },
    { categoryId: FIVE_K, price: 60_000, usageLimit: null, usageCount: 0 },
  ],
});

const fivePlusOne = (combinable: boolean): PromoTerms => ({
  ...base,
  code: '5+1 FREE',
  discountType: DISCOUNT_TYPES.BUY_X_GET_Y,
  buyQuantity: 5,
  getQuantity: 1,
  combinable,
});

function orderOf(runners: { categoryId: string; listPrice: number; upcharge?: number }[]): OrderBasis {
  const runnerPrices = runners.map(r => r.listPrice + (r.upcharge ?? 0));
  return {
    runnerPrices,
    runnerCategories: runners.map(r => ({ categoryId: r.categoryId, listPrice: r.listPrice })),
    subtotal: runnerPrices.reduce((sum, p) => sum + p, 0),
  };
}

const tenK = { categoryId: TEN_K, listPrice: 120_000 };
const fiveK = { categoryId: FIVE_K, listPrice: 80_000 };

// ── Six on the 10K: the owner's example ─────────────────────────────────────
const six = orderOf([tenK, tenK, tenK, tenK, tenK, tenK]);

const alone = bestDiscount([earlyBird(false), fivePlusOne(false)], six);
check('not combinable: early bird alone wins', alone?.code, 'EARLY BIRD');
check('not combinable: ₱1,800 off', alone?.amount, 180_000);
check('not combinable: nothing combined', alone?.combined, null);

const oneSide = bestDiscount([earlyBird(true), fivePlusOne(false)], six);
check('only one side combinable: still one promotion', oneSide?.combined, null);

const both = bestDiscount([earlyBird(true), fivePlusOne(true)], six)!;
check('both combinable: early bird + one free at ₱900 = ₱2,700 off', both.amount, 270_000);
check('the group pays 5 × ₱900', six.subtotal - both.amount, 450_000);
check('the price promotion leads', both.code, 'EARLY BIRD');
check('the deal rides along', both.combined?.code, '5+1 FREE');
check('the deal’s share is the free runner’s sale price', both.combined?.amount, 90_000);
check('the sixth runner is the free one', both.freeRunners, [5]);
check(
  'every line shows the early bird price',
  six.runnerCategories.map((r, i) => chargedRunnerPrice(both, i, r.listPrice)),
  [90_000, 90_000, 90_000, 90_000, 90_000, 90_000],
);

const parts = discountParts(both);
check('two parts', parts.map(p => p.code), ['EARLY BIRD', '5+1 FREE']);
check('the parts add up to the whole', parts.reduce((s, p) => s + p.amount, 0), both.amount);
check('the price part carries no free runners', parts[0].freeRunners, []);
check('a typed name inside the combo is not outshone', discountIncludesCode(both, '5+1 free'), true);
check(
  'the outshone sentence names both',
  outshoneByMessage('SUMMER10', both).includes('EARLY BIRD + 5+1 FREE'),
  true,
);

// ── Five runners: the deal does not apply, so nothing combines ──────────────
const five = orderOf([tenK, tenK, tenK, tenK, tenK]);
const short = bestDiscount([earlyBird(true), fivePlusOne(true)], five);
check('five runners: early bird only', short?.combined, null);
check('five runners: ₱1,500 off', short?.amount, 150_000);

// ── A mix: the deal frees the cheapest runner at its sale price ─────────────
const mixed = orderOf([tenK, tenK, tenK, tenK, tenK, fiveK]);
const mix = bestDiscount([earlyBird(true), fivePlusOne(true)], mixed)!;
check('mix: the 5K runner is the free one', mix.freeRunners, [5]);
check('mix: freed at the 5K sale price', mix.combined?.amount, 60_000);
check('mix: 5 × ₱900 paid', mixed.subtotal - mix.amount, 450_000);

// ── A capped early bird: the deal frees the cheapest *charged* price ─────────
// Two seats left on the 10K: runners 1–2 at ₱900, 3–6 at ₱1,200.
const capped = bestDiscount([earlyBird(true, 2), fivePlusOne(true)], six)!;
check('capped: two seats priced in', capped.amount - (capped.combined?.amount ?? 0), 60_000);
check('capped: a ₱900 runner is the free one', capped.combined?.amount, 90_000);
check('capped: the group pays 1 × ₱900 + 4 × ₱1,200', six.subtotal - capped.amount, 570_000);

// ── A shirt upcharge stays with the free runner's price ─────────────────────
const upcharged = orderOf([tenK, tenK, tenK, tenK, tenK, { ...tenK, upcharge: 15_000 }]);
const up = bestDiscount([earlyBird(true), fivePlusOne(true)], upcharged)!;
check('upcharge: a runner without the surcharge goes free', up.combined?.amount, 90_000);

// ── Two price promotions never stack ────────────────────────────────────────
const tenPercent: PromoTerms = {
  ...base,
  code: 'SUMMER10',
  discountType: DISCOUNT_TYPES.PERCENTAGE,
  discountValue: 10,
  automatic: false,
  combinable: true,
};
const twoPrices = bestDiscount([earlyBird(true), tenPercent], six);
check('two price promotions: one wins', twoPrices?.combined, null);
check('two price promotions: the larger', twoPrices?.code, 'EARLY BIRD');

// ── A percentage code may take the deal too ─────────────────────────────────
const pctDeal = bestDiscount([tenPercent, fivePlusOne(true)], six)!;
check('percentage + deal: combined', pctDeal.combined?.code, '5+1 FREE');
check('percentage + deal: 6 × ₱120 + one free at ₱1,080', pctDeal.amount, 72_000 + 108_000);

// ── A pacer code still wins outright ────────────────────────────────────────
const pacer: PromoTerms = {
  ...base,
  code: 'PACER-ANA',
  discountType: DISCOUNT_TYPES.PACER,
  automatic: false,
  combinable: true,
  categoryIds: [TEN_K],
};
const solo = orderOf([tenK]);
const pacerWin = bestDiscount([earlyBird(true), pacer], solo);
check('pacer: wins outright', pacerWin?.code, 'PACER-ANA');
check('pacer: never combined', pacerWin?.combined, null);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
