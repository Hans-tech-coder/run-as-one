import {
  defaultPaidBy,
  promoHandBackFor,
  promoStillActive,
  quoteRefund,
  readEntryAmount,
  refundBlockedBy,
  type RefundQuoteRunner,
} from '../src/lib/refund';
import { splitOrderMoney, type MoneyOrder } from '../src/lib/runner-money';
import { NO_ORDERS, settle } from '../src/lib/settlement';

/**
 * A check of `src/lib/refund.ts` and the settlement arithmetic it feeds. Touches
 * no database, like `check-runner-money.ts`.
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-refund.ts
 *
 * Exits non-zero if anything disagrees.
 */

let failures = 0;
function same(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) return;
  failures++;
  console.error(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const CAT = { id: 'cat', inclusions: ['Bib'] };
const runner = (id: string, listPrice: number, addOns: RefundQuoteRunner['addOns'] = []): RefundQuoteRunner => ({
  id,
  listPrice,
  promoPrice: null,
  category: CAT,
  singletSize: '',
  addOns,
});
const order = (o: Partial<MoneyOrder>): MoneyOrder => ({
  subtotal: 0, discountAmount: 0, combinedDiscountAmount: 0, discountType: null,
  addOnTotal: 0, platformFee: 0, deliveryFee: 0, transactionFee: 0, ...o,
});

// The plan's worked example: ₱1,000 entry, ₱300 organizer add-on, ₱50 fee.
{
  const q = quoteRefund(
    order({ subtotal: 100000, addOnTotal: 30000, platformFee: 5000 }),
    [runner('a', 100000, [{ unitPrice: 30000, quantity: 1, soldBy: 'ORGANIZER' }])],
    'a',
    0,
  )!;
  same('worked entry', q.suggestedAmount, 100000);
  same('worked add-on', q.addOnOrganizerAmount, 30000);
  same('worked fee kept', q.keptAdminFee, 5000);
  same('not editable', q.editable, false);
}

// QA: a split that cannot tell what was paid must refuse, never guess low.
{
  const two = order({ subtotal: 200000 });
  // A groupmate who upgraded goes in at the category they checked out in.
  const atPaid = quoteRefund(two, [runner('a', 100000), { ...runner('b', 100000), moved: true }], 'a', 0)!;
  same('groupmate upgrade pays in full', atPaid.suggestedAmount, 100000);
  same('groupmate upgrade is clear', atPaid.priceUnclear, false);
  same('price edited, entries differ: unclear', quoteRefund(order({ subtotal: 250000 }), [runner('a', 100000), runner('b', 200000)], 'a', 0)!.priceUnclear, true);
  same('price edited, entries equal: clear', quoteRefund(two, [runner('a', 120000), runner('b', 120000)], 'a', 0)!.priceUnclear, false);
  same('price edited, equal share is right', quoteRefund(two, [runner('a', 120000), runner('b', 120000)], 'a', 0)!.suggestedAmount, 100000);
  same('solo always clear', quoteRefund(order({ subtotal: 90000 }), [runner('a', 120000)], 'a', 0)!, { ...quoteRefund(order({ subtotal: 90000 }), [runner('a', 120000)], 'a', 0)!, suggestedAmount: 90000, priceUnclear: false });
  const sale = order({ subtotal: 200000, discountAmount: 20000, discountType: 'CATEGORY_PRICE' });
  same('moved groupmate on a sale: unclear', quoteRefund(sale, [runner('a', 100000), { ...runner('b', 100000), moved: true }], 'a', 0)!.priceUnclear, true);
  same('unclear is refused', typeof refundBlockedBy({ awaitingCategoryChange: false, awaitingDeliverySwitch: false, pricedCategoryChange: false, priceUnclear: true }), 'string');
}

// Trap 1: the split must see refunded runners, so the second refund and those
// who remain never move.
{
  const money = order({ subtotal: 300000, platformFee: 15000 });
  const all = [runner('a', 100000), runner('b', 100000), runner('c', 100000)];
  same('second refund unchanged', quoteRefund(money, all, 'b', 0)!.suggestedAmount, 100000);
  same('whole split', splitOrderMoney(money, all, 0).map(m => m.registrationFee), [100000, 100000, 100000]);
  // The bug being prevented: one runner missing rescales the rest upward.
  same('rescale if missing', splitOrderMoney(money, all.slice(1), 0).map(m => m.registrationFee), [150000, 150000]);
}

// D10: a 5+1 order. The free seat has ₱0 entry and only its add-ons refund.
{
  const money = order({ subtotal: 600000, discountAmount: 100000, discountType: 'BUY_X_GET_Y', addOnTotal: 20000 });
  const all = ['a', 'b', 'c', 'd', 'e'].map(id => runner(id, 100000)).concat(
    runner('free', 100000, [{ unitPrice: 20000, quantity: 1, soldBy: 'RUN_AS_ONE' }]),
  );
  const free = quoteRefund(money, all, 'free', 0)!;
  same('free seat entry', free.suggestedAmount, 0);
  same('free seat add-on', free.addOnRunAsOneAmount, 20000);
  same('free seat is free', free.freeEntry, true);
  const paid = quoteRefund(money, all, 'a', 0)!;
  same('5+1 editable', paid.editable, true);
  same('lower allowed', readEntryAmount('700', paid), { value: 70000, error: null });
  same('blank is suggested', readEntryAmount('', paid).value, 100000);
  same('raise refused', readEntryAmount('1001', paid).value, null);
}

// D10: every other order is locked to the split.
{
  const q = quoteRefund(order({ subtotal: 100000 }), [runner('a', 100000)], 'a', 0)!;
  same('locked lower refused', readEntryAmount('700', q).value, null);
  same('locked exact ok', readEntryAmount('1000', q).value, 100000);
}

// Trap 2: promo per kind.
same('seat', promoHandBackFor('CATEGORY_PRICE', { hasPromoPrice: true, share: 100, lastRunner: false }), { uses: 0, seat: true });
same('seat last', promoHandBackFor('CATEGORY_PRICE', { hasPromoPrice: true, share: 100, lastRunner: true }), { uses: 1, seat: true });
same('percent', promoHandBackFor('PERCENTAGE', { hasPromoPrice: false, share: 100, lastRunner: false }), { uses: 1, seat: false });
same('fixed no share', promoHandBackFor('FIXED', { hasPromoPrice: false, share: 0, lastRunner: true }), { uses: 0, seat: false });
same('deal not last', promoHandBackFor('BUY_X_GET_Y', { hasPromoPrice: false, share: 100, lastRunner: false }), { uses: 0, seat: false });
same('deal last', promoHandBackFor('BUY_X_GET_Y', { hasPromoPrice: false, share: 0, lastRunner: true }), { uses: 1, seat: false });

// D5.
const NOW = new Date('2026-11-08T00:00:00Z');
same('active', promoStillActive({ paused: false, validFrom: null, validUntil: null }, NOW), true);
same('off', promoStillActive({ paused: true, validFrom: null, validUntil: null }, NOW), false);
same('expired', promoStillActive({ paused: false, validFrom: null, validUntil: new Date('2026-11-01') }, NOW), false);

// D9.
same('allowed', refundBlockedBy({ awaitingCategoryChange: false, awaitingDeliverySwitch: false, pricedCategoryChange: false, priceUnclear: false }), null);
same('blocked', typeof refundBlockedBy({ awaitingCategoryChange: false, awaitingDeliverySwitch: true, pricedCategoryChange: false, priceUnclear: false }), 'string');

// QA: the Remittances lines under *Owed* must add up to it after a refund.
{
  const parts = { entries: 200000, discounts: 20000, delivery: 8000 };
  const s = settle(
    { ...NO_ORDERS, paidOrders: 1, collected: 233000, platformFees: 10000, transactionFees: 5000, addOnSales: 30000 },
    0,
    undefined,
    undefined,
    { refunds: 1, amount: 120000, toRefund: 120000, addOnSales: 30000, runAsOneAddOns: 0, organizerPaid: 0 },
  );
  same(
    'breakdown adds up to owed',
    parts.entries - parts.discounts + (s.refunds.addOnSales - s.refunds.amount) + s.addOns.organizer + parts.delivery,
    s.owed,
  );
}

// D7.
{
  const q = quoteRefund(order({ subtotal: 100000 }), [runner('a', 100000)], 'a', 0)!;
  same('enough balance', defaultPaidBy(100000, q), 'RUN_AS_ONE');
  same('remitted', defaultPaidBy(99999, q), 'ORGANIZER');
}

// Settlement: the identity, and an organizer-paid refund never reads Overpaid.
function identity(label: string, s: ReturnType<typeof settle>) {
  same(`${label} identity`, s.collected, s.platformFees + s.transactionFees + s.addOns.runAsOne + s.owed);
}
{
  const orders = { ...NO_ORDERS, paidOrders: 1, collected: 135000, platformFees: 5000, addOnSales: 30000 };
  const before = settle(orders, 0);
  identity('before', before);
  same('before owed', before.owed, 130000);

  const base = { refunds: 1, amount: 130000, toRefund: 130000, addOnSales: 30000, runAsOneAddOns: 0, organizerPaid: 0 };
  const ours = settle(orders, 0, undefined, undefined, base);
  identity('Run As One paid', ours);
  same('collected falls', ours.collected, 5000);
  same('fee kept', ours.platformFees, 5000);
  same('owed zero', ours.owed, 0);
  same('add-on sales fall', ours.addOns.sales, 0);

  const theirs = settle(orders, 130000, undefined, undefined, { ...base, organizerPaid: 130000 });
  identity('organizer paid', theirs);
  same('remitted falls', theirs.remitted, 0);
  same('not overpaid', theirs.balance, 0);
  same('settled', theirs.state, 'SETTLED');

  // A Run As One add-on the organizer refunded for it: Run As One owes that part.
  const mixedOrders = { ...orders, collected: 155000, addOnSales: 50000, runAsOneAddOns: 20000 };
  const mixed = settle(mixedOrders, 130000, undefined, undefined, {
    refunds: 1, amount: 150000, toRefund: 0, addOnSales: 50000, runAsOneAddOns: 20000, organizerPaid: 150000,
  });
  identity('mixed', mixed);
  same('owed to organizer for Run As One add-on', mixed.balance, 20000);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('refund checks passed.');
