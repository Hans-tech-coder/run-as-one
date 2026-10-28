import {
  addOnFromInput,
  addOnLinesTotal,
  availableAddOns,
  readAddOnSelection,
  runAsOneShare,
  stockBelowSoldProblem,
  stockLeft,
  type AddOnRule,
  picksAllowedIn,
  withRaceSizeFilled,
} from '../src/lib/add-ons';
import { chargeableTotal, isFreeOrder, raceEntryIsFree, transactionFeeFor } from '../src/lib/free-checkout';
import { quoteCategoryChange } from '../src/lib/category-change';

/**
 * A check of `src/lib/add-ons.ts`: which add-ons a runner may buy, what their
 * picks cost, and the admin form's refusals (ADD_ONS_PLAN.md Batch 1).
 *
 * The rules that matter most are the money ones — a line costs its price times
 * its quantity and nothing else, and the Run As One share is read off each
 * line's own seller — and that a posted pick the screen would not have offered
 * is refused rather than sold. Touches no database, like
 * `check-runner-money.ts`.
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-add-ons.ts
 *
 * Exits non-zero if anything disagrees.
 */

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL ${name}\n  got      ${a}\n  expected ${e}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const NOW = new Date('2026-11-01T00:00:00Z');

function item(options: Partial<AddOnRule> = {}): AddOnRule {
  return {
    id: 'shirt',
    name: 'COMMEMORATIVE SHIRT',
    price: 35000,
    optionKind: 'SHIRT_SIZES',
    options: [],
    maxPerRunner: 2,
    stockLimit: null,
    salesCloseAt: null,
    categoryIds: [],
    soldBy: 'ORGANIZER',
    active: true,
    ...options,
  };
}

const SHIRT = item();
const CAP = item({ id: 'cap', name: 'CAP', price: 25000, optionKind: 'CUSTOM', options: ['BLACK', 'WHITE'], maxPerRunner: 1, soldBy: 'RUN_AS_ONE' });
const TOWEL = item({ id: 'towel', name: 'TOWEL', price: 15000, optionKind: 'NONE', categoryIds: ['cat-21k'] });

// ── availableAddOns ──
check(
  'every category sees an item with no category list; a scoped one only its own',
  availableAddOns([SHIRT, TOWEL], 'cat-5k', NOW).map(a => a.id),
  ['shirt'],
);
check('the scoped item shows to its category', availableAddOns([SHIRT, TOWEL], 'cat-21k', NOW).map(a => a.id), ['shirt', 'towel']);
check('a switched-off item is not offered', availableAddOns([item({ active: false })], 'cat-5k', NOW).length, 0);
check(
  'an item past its cutoff is not offered; one before it is',
  availableAddOns(
    [item({ id: 'closed', salesCloseAt: '2026-10-31T23:59:00Z' }), item({ id: 'open', salesCloseAt: '2026-11-02T00:00:00Z' })],
    'cat-5k',
    NOW,
  ).map(a => a.id),
  ['open'],
);

// ── stockLeft ──
check('no limit is unlimited', stockLeft(SHIRT, 999), null);
check('limit minus taken', stockLeft(item({ stockLimit: 50 }), 48), 2);
check('a limit lowered under what sold reads as sold out, not negative', stockLeft(item({ stockLimit: 10 }), 12), 0);

// ── readAddOnSelection ──
const picked = readAddOnSelection(
  [
    { addOnId: 'shirt', option: 'm', quantity: 2 },
    { addOnId: 'cap', option: 'BLACK', quantity: 1 },
  ],
  [SHIRT, CAP],
);
check('a valid pick prices from the item, uppercases the size, keeps the seller', picked, {
  lines: [
    { addOnId: 'shirt', name: 'COMMEMORATIVE SHIRT', unitPrice: 35000, option: 'M', soldBy: 'ORGANIZER', quantity: 2 },
    { addOnId: 'cap', name: 'CAP', unitPrice: 25000, option: 'BLACK', soldBy: 'RUN_AS_ONE', quantity: 1 },
  ],
});
check('no picks is no lines', readAddOnSelection(undefined, [SHIRT]), { lines: [] });
check('an item not offered to this runner is refused', 'error' in readAddOnSelection([{ addOnId: 'towel', quantity: 1 }], [SHIRT]), true);
check('over the per-runner limit is refused', 'error' in readAddOnSelection([{ addOnId: 'cap', option: 'BLACK', quantity: 2 }], [CAP]), true);
check('a zero quantity is refused', 'error' in readAddOnSelection([{ addOnId: 'shirt', option: 'M', quantity: 0 }], [SHIRT]), true);
check('a size off the chart is refused', 'error' in readAddOnSelection([{ addOnId: 'shirt', option: '9XL', quantity: 1 }], [SHIRT]), true);
check('a custom option not listed is refused', 'error' in readAddOnSelection([{ addOnId: 'cap', option: 'RED', quantity: 1 }], [CAP]), true);
check(
  'the same item twice on one runner is refused',
  'error' in readAddOnSelection([{ addOnId: 'shirt', option: 'M', quantity: 1 }, { addOnId: 'shirt', option: 'L', quantity: 1 }], [SHIRT]),
  true,
);
check(
  'an item with no options ignores a posted option',
  readAddOnSelection([{ addOnId: 'towel', option: 'X', quantity: 1 }], [TOWEL]),
  { lines: [{ addOnId: 'towel', name: 'TOWEL', unitPrice: 15000, option: null, soldBy: 'ORGANIZER', quantity: 1 }] },
);
check('a price in the post is never read', 'lines' in picked && picked.lines[0].unitPrice, 35000);

// ── money ──
const lines = 'lines' in picked ? picked.lines : [];
check('lines total is price × quantity: ₱350 × 2 + ₱250', addOnLinesTotal(lines), 95000);
check('Run As One keeps only its own lines: the cap', runAsOneShare(lines), 25000);
check('nothing bought is ₱0', addOnLinesTotal([]), 0);

// ── addOnFromInput ──
const CATEGORIES = { eventCategoryIds: ['cat-5k', 'cat-21k'] };
const form = {
  name: '  commemorative   shirt ',
  description: 'Dri-fit, race-day print.',
  price: '350',
  imageUrls: ['https://blob.example/shirt.jpg'],
  optionKind: 'SHIRT_SIZES',
  options: 'ignored',
  maxPerRunner: '2',
  stockLimit: '',
  salesCloseAt: '',
  categoryIds: [],
  soldBy: 'ORGANIZER',
};
const saved = addOnFromInput(form, CATEGORIES);
check('the name is stored uppercase with spaces collapsed', 'data' in saved && saved.data.name, 'COMMEMORATIVE SHIRT');
check('the price is pesos → centavos', 'data' in saved && saved.data.price, 35000);
check('options are dropped for a kind that has none of its own', 'data' in saved && saved.data.options, []);
check('a blank stock is unlimited', 'data' in saved && saved.data.stockLimit, null);
check('a new item is on', 'data' in saved && saved.data.active, true);

const field = (raw: Record<string, unknown>) => {
  const result = addOnFromInput({ ...form, ...raw }, CATEGORIES);
  return 'problem' in result ? result.problem.field : null;
};
check('custom options are uppercased and de-duplicated', (() => {
  const r = addOnFromInput({ ...form, optionKind: 'CUSTOM', options: 'black, White, BLACK, ' }, CATEGORIES);
  return 'data' in r && r.data.options;
})(), ['BLACK', 'WHITE']);
check('a blank name names the name box', field({ name: '  ' }), 'name');
check('a ₱0 price is refused', field({ price: '0' }), 'price');
check('a price with three decimals is refused', field({ price: '350.005' }), 'price');
check('a price past ₱10,000 is refused', field({ price: '10000.01' }), 'price');
check('one custom option is refused', field({ optionKind: 'CUSTOM', options: 'BLACK' }), 'options');
check('an unknown option kind is refused', field({ optionKind: 'COLOURS' }), 'optionKind');
check('11 per runner is refused', field({ maxPerRunner: '11' }), 'maxPerRunner');
check('a fractional stock is refused', field({ stockLimit: '2.5' }), 'stockLimit');
check('a category from another event is refused', field({ categoryIds: ['cat-other'] }), 'categoryIds');
check('an unknown seller is refused', field({ soldBy: 'CLIENT' }), 'soldBy');
check('a non-https image is refused', field({ imageUrls: ['javascript:alert(1)'] }), 'imageUrls');
check('a bad cutoff is refused', field({ salesCloseAt: 'next week' }), 'salesCloseAt');
check('stock may not go under what sold', stockBelowSoldProblem(5, 7)?.field, 'stockLimit');
check('stock equal to what sold is fine', stockBelowSoldProblem(7, 7), null);

// ── The order's money (Batch 2) ─────────────────────────────────────────────
// D8: a pacer's free entry (100% off, admin fee waived) plus a ₱350 shirt is
// a ₱350 checkout, paid the normal way, not a ₱0 order.
const pacerChargeable = chargeableTotal({ subtotal: 79900, deliveryFee: 0, platformFee: 0, discountAmount: 79900, addOnTotal: 35000 });
check('D8: free entry + shirt is chargeable for the shirt', pacerChargeable, 35000);
check('D8: free entry + shirt is not a free order', isFreeOrder(pacerChargeable), false);
check('D8: free entry alone is still free', isFreeOrder(chargeableTotal({ subtotal: 79900, deliveryFee: 0, platformFee: 0, discountAmount: 79900 })), true);
const pacerFee = transactionFeeFor(pacerChargeable, 'QRPH');
const pacerOrder = { totalAmount: pacerChargeable + pacerFee, addOnTotal: 35000, transactionFee: pacerFee };
check('the entry of free entry + shirt (QR Ph) still reads as free', raceEntryIsFree(pacerOrder), true);
check('a paid entry with a shirt is not free', raceEntryIsFree({ totalAmount: 79900 + 4000 + 35000, addOnTotal: 35000, transactionFee: 0 }), false);

// Risk 2: that pacer upgrades 5K (₱799) → 10K (₱1,099). The entry cost
// nothing, so the basis is 0 and the full new price is charged — not the
// ₱300 difference a whole-order "was it free?" would have quoted.
const upgrade = quoteCategoryChange({
  fromPrice: 79900,
  toPrice: 109900,
  promoPrice: null,
  order: { discountAmount: 79900, discountType: 'PERCENTAGE', ...pacerOrder, runnerCount: 1 },
  event: { categoryChangeFee: 0, downgradeRefundPolicy: 'NO_REFUND' },
});
check('Risk 2: free entry + shirt upgrading has basis 0', [upgrade.basis, upgrade.estimateReason], [0, 'FREE_ORDER']);
check('Risk 2: free entry + shirt upgrading is charged the full new price', upgrade.amount, 109900);

// The wizard: a category change drops what the new category is not offered,
// and a shirt picked before the race size takes that size.
const tenKOnly = item({ id: 'cap', name: 'CAP', optionKind: 'NONE', categoryIds: ['cat-10k'] });
const picks = [{ addOnId: 'shirt', option: '', quantity: 1 }, { addOnId: 'cap', option: '', quantity: 1 }];
check('5K → keeps the shirt, drops the 10K-only cap', picksAllowedIn(picks, [item(), tenKOnly], 'cat-5k'), {
  kept: [picks[0]],
  dropped: ['CAP'],
});
check('a blank shirt size takes the race size', withRaceSizeFilled(picks, [item(), tenKOnly], 'M').map(p => p.option), ['M', '']);
check('a chosen shirt size is kept', withRaceSizeFilled([{ addOnId: 'shirt', option: 'XL', quantity: 1 }], [item()], 'M')[0].option, 'XL');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll add-on checks passed.');
