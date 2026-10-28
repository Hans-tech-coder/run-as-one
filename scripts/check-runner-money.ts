import { splitOrderMoney, type MoneyOrder, type MoneyRunner } from '../src/lib/runner-money';

/**
 * A check of `src/lib/runner-money.ts`: the per-runner split behind the
 * registrants export's summable money columns.
 *
 * The rule that matters is that a group's runners add up to its order total,
 * not to six times it, and that the discount lands on the right runner. The
 * first case is the 5+1 group staff split by hand on 2026-10-26. Touches no
 * database, like `check-per-runner-discount.ts`.
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-runner-money.ts
 *
 * Exits non-zero if anything disagrees.
 */

let failures = 0;

const SHIRT = { id: 'cat-shirt', inclusions: ['Singlet', 'Medal'] };
const BAND = { id: 'cat-band', inclusions: ['Bib'] };

function runner(listPrice: number, options: Partial<MoneyRunner> = {}): MoneyRunner {
  return { listPrice, promoPrice: null, category: BAND, singletSize: '', addOns: [], ...options };
}

function order(options: Partial<MoneyOrder>): MoneyOrder {
  return {
    subtotal: 0,
    discountAmount: 0,
    combinedDiscountAmount: 0,
    discountType: null,
    addOnTotal: 0,
    platformFee: 0,
    deliveryFee: 0,
    transactionFee: 0,
    ...options,
  };
}

function check(
  name: string,
  money: MoneyOrder,
  runners: MoneyRunner[],
  expected: { registrationFee: number[]; total: number[]; free?: number[]; addOns?: number[] },
  upcharge = 0,
) {
  const split = splitOrderMoney(money, runners, upcharge);
  const fees = split.map(r => r.registrationFee);
  const totals = split.map(r => r.total);
  const free = split.flatMap((r, index) => (r.freeEntry ? [index] : []));
  const addOns = split.map(r => r.addOns);
  const orderTotal =
    money.subtotal -
    money.discountAmount +
    money.addOnTotal +
    money.platformFee +
    money.deliveryFee +
    money.transactionFee;
  const summed = totals.reduce((sum, total) => sum + total, 0);

  const problems: string[] = [];
  if (JSON.stringify(fees) !== JSON.stringify(expected.registrationFee)) {
    problems.push(`registration fees ${JSON.stringify(fees)}, expected ${JSON.stringify(expected.registrationFee)}`);
  }
  if (JSON.stringify(totals) !== JSON.stringify(expected.total)) {
    problems.push(`totals ${JSON.stringify(totals)}, expected ${JSON.stringify(expected.total)}`);
  }
  if (JSON.stringify(free) !== JSON.stringify(expected.free ?? [])) {
    problems.push(`free runners ${JSON.stringify(free)}, expected ${JSON.stringify(expected.free ?? [])}`);
  }
  if (JSON.stringify(addOns) !== JSON.stringify(expected.addOns ?? runners.map(() => 0))) {
    problems.push(`add-ons ${JSON.stringify(addOns)}, expected ${JSON.stringify(expected.addOns ?? runners.map(() => 0))}`);
  }
  if (summed !== orderTotal) problems.push(`runners sum to ${summed}, order total is ${orderTotal}`);

  if (problems.length) {
    failures++;
    console.error(`FAIL ${name}\n  ${problems.join('\n  ')}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// RM-2EA2F92E: six 10Ks at ₱1,499 on "5+1 FREE", ₱40 admin fee each. Staff's
// hand-built sheet: ₱1,499 + ₱40 on runners 1-5, ₱0 + ₱40 on runner 6.
check(
  '5+1 group: the last runner is the free one, totals sum to ₱7,735',
  order({ subtotal: 899400, discountAmount: 149900, discountType: 'BUY_X_GET_Y', platformFee: 24000 }),
  Array.from({ length: 6 }, () => runner(149900)),
  {
    registrationFee: [149900, 149900, 149900, 149900, 149900, 0],
    total: [153900, 153900, 153900, 153900, 153900, 4000],
    free: [5],
  },
);

check(
  'mixed group: the deal gives away the cheapest entry',
  order({ subtotal: 799400, discountAmount: 99900, discountType: 'BUY_X_GET_Y', platformFee: 24000 }),
  [runner(149900), runner(99900), runner(149900), runner(149900), runner(99900), runner(149900)],
  {
    registrationFee: [149900, 99900, 149900, 149900, 0, 149900],
    total: [153900, 103900, 153900, 153900, 4000, 153900],
    free: [4],
  },
);

// "EARLY BIRD + 5+1 FREE": six at a ₱1,499 sale price on a ₱1,699 list, the
// free runner's ₱1,499 being the deal's part of the whole discount.
check(
  'combined early bird + 5+1: everyone saves ₱200, the last one runs free',
  order({
    subtotal: 1019400,
    discountAmount: 6 * 20000 + 149900,
    combinedDiscountAmount: 149900,
    discountType: 'CATEGORY_PRICE',
    platformFee: 24000,
  }),
  Array.from({ length: 6 }, () => runner(169900, { promoPrice: 149900 })),
  {
    registrationFee: [149900, 149900, 149900, 149900, 149900, 0],
    total: [153900, 153900, 153900, 153900, 153900, 4000],
    free: [5],
  },
);

// RM-C7314E7A: one 5K, ₱100 off on the early bird, ₱1,039 in all.
check(
  'single runner on a category price',
  order({ subtotal: 109900, discountAmount: 10000, discountType: 'CATEGORY_PRICE', platformFee: 4000 }),
  [runner(109900, { promoPrice: 99900 })],
  { registrationFee: [99900], total: [103900] },
);

check(
  'a sale that ran out mid-group discounts only the runners who got a seat',
  order({ subtotal: 359700, discountAmount: 60000, discountType: 'CATEGORY_PRICE', platformFee: 12000 }),
  [runner(119900, { promoPrice: 89900 }), runner(119900, { promoPrice: 89900 }), runner(119900)],
  { registrationFee: [89900, 89900, 119900], total: [93900, 93900, 123900] },
);

check(
  'delivery and transaction fees land on the first runner only; the upcharge stays with its runner',
  order({ subtotal: 309800, platformFee: 8000, deliveryFee: 15000, transactionFee: 6200 }),
  [runner(149900, { category: SHIRT, singletSize: 'M' }), runner(149900, { category: SHIRT, singletSize: '4XL' })],
  { registrationFee: [149900, 159900], total: [175100, 163900] },
  10000,
);

// RM-FF1E56E5 on local-dev: two runners whose category now lists at ₱1,099,
// on an order that was charged ₱1,998.
check(
  'a price changed since checkout: the stored subtotal wins',
  order({ subtotal: 199800, platformFee: 8000 }),
  [runner(109900), runner(109900)],
  { registrationFee: [99900, 99900], total: [103900, 103900] },
);

check(
  'a pacer with the admin fee waived is free and ₱0',
  order({ subtotal: 149900, discountAmount: 149900, discountType: 'PACER' }),
  [runner(149900)],
  { registrationFee: [0], total: [0], free: [0] },
);

check(
  'an admin fee that does not divide evenly leaves its centavo on runner 1',
  order({ subtotal: 300000, platformFee: 100 }),
  [runner(100000), runner(100000), runner(100000)],
  { registrationFee: [100000, 100000, 100000], total: [100034, 100033, 100033] },
);

check(
  'a 20% code splits by each runner’s own saving',
  order({ subtotal: 250000, discountAmount: 50000, discountType: 'PERCENTAGE' }),
  [runner(150000, { promoPrice: 120000 }), runner(100000, { promoPrice: 80000 })],
  { registrationFee: [120000, 80000], total: [120000, 80000] },
);

// ── Add-ons (ADD_ONS_PLAN.md Batch 3) ───────────────────────────────────────

const SHIRT_LINE = { unitPrice: 35000, quantity: 1 };
const CAP_LINE = { unitPrice: 20000, quantity: 1 };

// Who sold an item does not change who paid for it: runner 1's organizer
// shirt and Run As One cap are both theirs, and the QR Ph fee rides on runner 1.
check(
  'mixed sellers: each runner carries their own add-ons',
  order({ subtotal: 240000, addOnTotal: 75000, platformFee: 8000, transactionFee: 4500 }),
  [runner(120000, { addOns: [SHIRT_LINE, CAP_LINE] }), runner(120000, { addOns: [CAP_LINE] })],
  { registrationFee: [120000, 120000], total: [183500, 144000], addOns: [55000, 20000] },
);

check(
  'a 20% code never touches the add-ons (D5)',
  order({ subtotal: 250000, discountAmount: 50000, discountType: 'PERCENTAGE', addOnTotal: 70000 }),
  [runner(150000, { promoPrice: 120000 }), runner(100000, { promoPrice: 80000, addOns: [{ unitPrice: 35000, quantity: 2 }] })],
  { registrationFee: [120000, 80000], total: [120000, 150000], addOns: [0, 70000] },
);

check(
  'a ₱0 pacer entry plus a shirt is a free entry on a paid order (D8)',
  order({ subtotal: 149900, discountAmount: 149900, discountType: 'PACER', addOnTotal: 35000, transactionFee: 2100 }),
  [runner(149900, { addOns: [SHIRT_LINE] })],
  { registrationFee: [0], total: [37100], free: [0], addOns: [35000] },
);

check(
  'a 5+1 deal gives away an entry, not the free runner’s shirt',
  order({ subtotal: 899400, discountAmount: 149900, discountType: 'BUY_X_GET_Y', addOnTotal: 35000, platformFee: 24000 }),
  [...Array.from({ length: 5 }, () => runner(149900)), runner(149900, { addOns: [SHIRT_LINE] })],
  {
    registrationFee: [149900, 149900, 149900, 149900, 149900, 0],
    total: [153900, 153900, 153900, 153900, 153900, 39000],
    free: [5],
    addOns: [0, 0, 0, 0, 0, 35000],
  },
);

// A runner removed since checkout took their shirt line with them, but the
// order still holds what was paid for it: the stored add-on total wins.
check(
  'lines that no longer reach the stored add-on total: the total wins',
  order({ subtotal: 120000, addOnTotal: 70000, platformFee: 4000 }),
  [runner(120000, { addOns: [SHIRT_LINE] })],
  { registrationFee: [120000], total: [194000], addOns: [70000] },
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll runner money checks passed.');
