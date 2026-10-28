import { chargeableTotal, transactionFeeFor } from '../src/lib/free-checkout';
import { platformFeeAfterDiscount } from '../src/lib/discount';
import { paymongoLineItems, paymongoOrderFromRegistration, type PaymongoOrder } from '../src/lib/paymongo-session';
import { runnerPrices, subtotalWithUpcharge } from '../src/lib/shirt-size';

/**
 * A check that a PayMongo Checkout Session bills exactly the order's total.
 *
 * PayMongo totals a checkout session from its line items, not from any amount
 * we send beside them, so `paymongoLineItems` (lib/paymongo-session.ts) has to
 * add up to `totalAmount` to the centavo. The case that once broke it: an
 * order with no promo and a 4XL runner, whose runner line was the category's
 * price alone while the subtotal carried the large-size upcharge — the runner
 * was charged ₱100 less than the order said.
 *
 * Pure arithmetic: no database, no environment. The figures mirror Pink Run
 * 2026 on `local-dev` (5K at ₱799, ₱100 upcharge, ₱40 admin fee). Run it with
 * the same alias as `check-category-price-math.ts`:
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-paymongo-line-items.ts
 *
 *   bash:
 *     JITI_ALIAS='{"@/":"'"$PWD"'/src/"}' npx jiti scripts/check-paymongo-line-items.ts
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

const sum = (items: { amount: number }[]) => items.reduce((total, item) => total + item.amount, 0);

const UPCHARGE = 10_000;
const ADMIN_FEE = 4_000;
const FIVE_K = { id: 'cat-5k', name: '5K', price: 79_900, inclusions: ['Event Shirt', 'Medal'] };
const categories = [FIVE_K];
const participants = [
  { categoryId: FIVE_K.id, singletSize: '4XL' },
  { categoryId: FIVE_K.id, singletSize: 'M' },
];

// Priced the way api/checkout prices it.
const subtotal = subtotalWithUpcharge(participants, categories, UPCHARGE);
const platformFee = platformFeeAfterDiscount(ADMIN_FEE, participants.length, null);
const chargeable = chargeableTotal({ subtotal, deliveryFee: 0, platformFee, discountAmount: 0 });
const transactionFee = transactionFeeFor(chargeable, 'QRPH');
const totalAmount = chargeable + transactionFee;

check('the 4XL runner carries the upcharge in the subtotal', subtotal, 79_900 * 2 + UPCHARGE);

// ── At checkout ─────────────────────────────────────────────────────────────
const prices = runnerPrices(participants, categories, UPCHARGE);
const order: PaymongoOrder = {
  orderRef: 'RAO-TEST',
  amountCents: totalAmount,
  paymentMethod: 'QRPH',
  description: 'Registration for Pink Run 2026',
  customerName: 'TEST',
  customerEmail: 'test@example.com',
  runners: participants.map((_, i) => ({ categoryName: FIVE_K.name, price: prices[i] })),
  subtotalCents: subtotal,
  discountAmount: 0,
  promoCode: null,
  deliveryFeeCents: 0,
  platformFeeCents: platformFee,
  transactionFeeCents: transactionFee,
};
const items = paymongoLineItems(order);
check('checkout: line items sum to totalAmount', sum(items), totalAmount);
check('checkout: the 4XL runner is billed with the upcharge', items[0].amount, 79_900 + UPCHARGE);
check('checkout: the M runner is billed the category price', items[1].amount, 79_900);

// ── On the resume-payment link, rebuilt from the stored order ───────────────
const stored = {
  orderRef: 'RAO-TEST',
  totalAmount,
  paymentMethod: 'QRPH',
  customerName: 'TEST',
  customerEmail: 'test@example.com',
  subtotal,
  discountAmount: 0,
  promoCode: null,
  combinedPromoCode: null,
  deliveryFee: 0,
  platformFee,
  transactionFee,
  event: { title: 'Pink Run 2026', shirtSizeUpcharge: UPCHARGE },
  runners: participants.map(p => ({ ...p, category: FIVE_K })),
};
check('resume: line items sum to totalAmount', sum(paymongoLineItems(paymongoOrderFromRegistration(stored))), totalAmount);

// A band-only package is never charged for a shirt, whatever size is stored.
const bandOnly = { ...FIVE_K, inclusions: ['Race Bib', 'Medal'] };
const bandSubtotal = 79_900 * 2;
check(
  'resume: no upcharge on a package with nothing to wear',
  sum(paymongoLineItems(paymongoOrderFromRegistration({
    ...stored,
    subtotal: bandSubtotal,
    runners: participants.map(p => ({ ...p, category: bandOnly })),
  }))) - (stored.platformFee + stored.transactionFee),
  bandSubtotal,
);

// A category repriced after the order was placed: the stored subtotal is what
// is owed, so that is what is billed.
const repriced = { ...FIVE_K, price: 89_900 };
const repricedItems = paymongoLineItems(paymongoOrderFromRegistration({
  ...stored,
  runners: participants.map(p => ({ ...p, category: repriced })),
}));
check('resume, category repriced since: still sums to totalAmount', sum(repricedItems), totalAmount);

// ── A discounted order still bills subtotal − discount as one line ──────────
const discountAmount = 20_000;
const discounted = chargeableTotal({ subtotal, deliveryFee: 0, platformFee, discountAmount });
const discountedFee = transactionFeeFor(discounted, 'QRPH');
check(
  'discounted: line items sum to totalAmount',
  sum(paymongoLineItems({
    ...order,
    amountCents: discounted + discountedFee,
    discountAmount,
    promoCode: 'PINK',
    transactionFeeCents: discountedFee,
  })),
  discounted + discountedFee,
);

// ── Add-ons (ADD_ONS_PLAN.md): their own lines, never folded into a discount ─
const SHIRT = { name: 'COMMEMORATIVE SHIRT', option: 'M', unitPrice: 35_000, quantity: 1 };
const CAP = { name: 'CAP', option: null, unitPrice: 25_000, quantity: 2 };
const addOnTotal = SHIRT.unitPrice * SHIRT.quantity + CAP.unitPrice * CAP.quantity;

const withAddOnsChargeable = chargeableTotal({ subtotal, deliveryFee: 0, platformFee, discountAmount: 0, addOnTotal });
const withAddOnsFee = transactionFeeFor(withAddOnsChargeable, 'QRPH');
const withAddOns: PaymongoOrder = {
  ...order,
  amountCents: withAddOnsChargeable + withAddOnsFee,
  transactionFeeCents: withAddOnsFee,
  addOns: [{ ...SHIRT, runnerNo: 2 }, { ...CAP, runnerNo: 1 }],
};
const addOnItems = paymongoLineItems(withAddOns);
check('add-ons: line items sum to totalAmount', sum(addOnItems), withAddOnsChargeable + withAddOnsFee);
check(
  'add-ons: each line names its runner, item, option and quantity',
  addOnItems.filter(item => item.name.startsWith('Runner ') && item.name.includes('·')).map(item => [item.name, item.amount]),
  [['Runner 2 · COMMEMORATIVE SHIRT (M) × 1', 35_000], ['Runner 1 · CAP × 2', 50_000]],
);

// A discounted order: the entries collapse into one line, the add-ons do not.
const discountedAddOns = chargeableTotal({ subtotal, deliveryFee: 0, platformFee, discountAmount, addOnTotal });
const discountedAddOnsFee = transactionFeeFor(discountedAddOns, 'QRPH');
const discountedAddOnItems = paymongoLineItems({
  ...withAddOns,
  amountCents: discountedAddOns + discountedAddOnsFee,
  discountAmount,
  promoCode: 'PINK',
  transactionFeeCents: discountedAddOnsFee,
});
check('add-ons, discounted: line items sum to totalAmount', sum(discountedAddOnItems), discountedAddOns + discountedAddOnsFee);
check('add-ons, discounted: the shirt keeps its full price', discountedAddOnItems.find(item => item.name.includes('SHIRT'))?.amount, 35_000);

// A pacer's free entry plus a shirt (D8): the entries bill nothing, the shirt
// and PayMongo's cut on it are the whole charge.
const pacerChargeable = chargeableTotal({ subtotal: 79_900, deliveryFee: 0, platformFee: 0, discountAmount: 79_900, addOnTotal: 35_000 });
const pacerFee = transactionFeeFor(pacerChargeable, 'QRPH');
const pacerItems = paymongoLineItems({
  ...order,
  amountCents: pacerChargeable + pacerFee,
  runners: [{ categoryName: '5K', price: 79_900 }],
  subtotalCents: 79_900,
  discountAmount: 79_900,
  promoCode: 'PACER',
  platformFeeCents: 0,
  transactionFeeCents: pacerFee,
  addOns: [{ ...SHIRT, runnerNo: 1 }],
});
check('free entry + shirt: billed the shirt and its fee only', pacerItems.map(item => item.amount), [35_000, pacerFee]);

// On the resume link, rebuilt from the stored RunnerAddOn rows, by runnerNo.
const storedWithAddOns = {
  ...stored,
  totalAmount: withAddOnsChargeable + withAddOnsFee,
  transactionFee: withAddOnsFee,
  runners: participants.map((p, i) => ({
    ...p,
    category: FIVE_K,
    runnerNo: i + 1,
    addOns: i === 0 ? [CAP] : [SHIRT],
  })),
};
const resumedAddOnItems = paymongoLineItems(paymongoOrderFromRegistration(storedWithAddOns));
check('resume, add-ons: line items sum to totalAmount', sum(resumedAddOnItems), withAddOnsChargeable + withAddOnsFee);
check('resume, add-ons: the shirt is Runner 2’s', resumedAddOnItems.some(item => item.name === 'Runner 2 · COMMEMORATIVE SHIRT (M) × 1'), true);

// A category change bills its own lines; the add-ons were paid with the order.
check(
  'category change: add-ons are not billed again',
  paymongoLineItems({ ...withAddOns, items: [{ name: 'Category change', amount: 30_000 }], transactionFeeCents: 0, platformFeeCents: 0 }).map(item => item.amount),
  [30_000],
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
