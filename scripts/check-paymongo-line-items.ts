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

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
