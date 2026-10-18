import {
  LOGISTICS_DIRECTIONS,
  canSwitchLogistics,
  logisticsChangeDeadline,
  quoteLogisticsChange,
  type ExistingDelivery,
  type LogisticsQuoteInput,
} from '../src/lib/logistics-change';
import { transactionFeeFor } from '../src/lib/free-checkout';
import {
  composeDeliveryAddress,
  EMPTY_DELIVERY_ADDRESS,
} from '../src/app/events/[slug]/register/delivery-address';

/**
 * A check of the delivery switch quote (LOGISTICS_CHANGE_PLAN.md
 * Verification): one fee per parcel across the orders switched, ₱0 when the
 * address already receives a PAID delivery and never when it only awaits
 * payment, a zone the event does not deliver to refused, back to pickup free,
 * and the deadline.
 *
 * There is no test runner in this project, so this is a script rather than a
 * spec. It touches no database and needs no environment. Run it with the
 * alias the module imports through, since jiti does not read tsconfig paths:
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-logistics-change.ts
 *
 *   Git Bash (the alias must be the Windows path; "$PWD" is a /c/... one):
 *     JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}' npx jiti scripts/check-logistics-change.ts
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

const INSIDE = 15_000;
const OUTSIDE = 25_000;
const event = {
  province: 'Tarlac',
  location: 'Tarlac City',
  date: '2026-11-15',
  logisticsPickup: true,
  logisticsDeliveryFeeInside: INSIDE,
  logisticsDeliveryFeeOutside: OUTSIDE,
};

const home = (street: string, province: string, city: string) => ({
  addressStreet: street,
  addressBarangay: 'SAN ISIDRO',
  addressCity: city,
  addressProvince: province,
});
const TARLAC_A = home('BLK 5 RIZAL ST.', 'TARLAC', 'TARLAC CITY');
const TARLAC_B = home('12 MABINI ST.', 'TARLAC', 'CAPAS');
const PAMPANGA = home('3 LUNA ST.', 'PAMPANGA', 'ANGELES CITY');

/** The one-address form, composed the way the wizard and the modal post it. */
const shipTo = (a: typeof TARLAC_A, extra: { zip?: string; landmark?: string } = {}) =>
  composeDeliveryAddress({
    ...EMPTY_DELIVERY_ADDRESS,
    street: a.addressStreet,
    barangay: a.addressBarangay,
    city: a.addressCity,
    province: a.addressProvince,
    zip: extra.zip ?? '',
    landmark: extra.landmark ?? '',
  });

const quote = (overrides: Partial<LogisticsQuoteInput>) =>
  quoteLogisticsChange({
    event,
    direction: LOGISTICS_DIRECTIONS.TO_DELIVERY,
    orders: [{ id: 'order-1', runners: [TARLAC_A] }],
    target: { deliveryAddress: shipTo(TARLAC_A) },
    existing: [],
    ...overrides,
  });

const fee = (q: ReturnType<typeof quote>) => (q.ok ? q.fee : q.reason);

// ── Single order ─────────────────────────────────────────────────────────────

check('single order inside the province pays the inside tier', fee(quote({})), INSIDE);
check(
  'single order outside the province pays the outside tier',
  fee(quote({ orders: [{ id: 'order-1', runners: [PAMPANGA] }], target: { deliveryAddress: shipTo(PAMPANGA) } })),
  OUTSIDE,
);
const single = quote({});
check('a fee to pay waits for payment', single.ok && single.status, 'AWAITING_PAYMENT');

// ── Groups ───────────────────────────────────────────────────────────────────

const group = { id: 'order-1', runners: [TARLAC_A, PAMPANGA] };
check(
  'group to one address pays one tier',
  fee(quote({ orders: [group], target: { deliveryAddress: shipTo(TARLAC_A) } })),
  INSIDE,
);
const splitGroup = quote({ orders: [group], target: { deliverySplit: true } });
check('group split pays one tier per household', fee(splitGroup), INSIDE + OUTSIDE);
check('group split makes two parcels', splitGroup.ok && splitGroup.parcels.length, 2);
check('group split stores no single address', splitGroup.ok && [splitGroup.deliveryAddress, splitGroup.deliverySplit], [null, true]);

// ── Combining orders (L6) ────────────────────────────────────────────────────

const twoOrders = [
  { id: 'order-1', runners: [TARLAC_A] },
  { id: 'order-2', runners: [TARLAC_B] },
];
check(
  'two orders combined to one address pay one fee',
  fee(quote({ orders: twoOrders, target: { deliveryAddress: shipTo(TARLAC_A) } })),
  INSIDE,
);
check(
  'two orders split, same household, pay one fee',
  fee(
    quote({
      orders: [
        { id: 'order-1', runners: [TARLAC_A] },
        { id: 'order-2', runners: [{ ...TARLAC_A, addressStreet: 'blk 5 rizal st.' }] },
      ],
      target: { deliverySplit: true },
    }),
  ),
  INSIDE,
);
const splitTwo = quote({ orders: twoOrders, target: { deliverySplit: true } });
check('two orders split, two households, pay two fees', fee(splitTwo), INSIDE * 2);
check(
  'a split parcel remembers which order each kit came from',
  splitTwo.ok && splitTwo.parcels.map(p => p.kits),
  [[{ order: 0, runner: 0 }], [{ order: 1, runner: 0 }]],
);

// ── Riding on an existing parcel (L6) ────────────────────────────────────────

const paidOneAddress: ExistingDelivery = {
  registrationId: 'paid-1',
  status: 'PAID',
  logisticsMethod: 'DELIVERY',
  // The zip and landmark are the parcel's, not the address: still one place.
  deliveryAddress: shipTo(TARLAC_A, { zip: '2300', landmark: 'BLUE GATE' }),
  deliverySplit: false,
  runners: [TARLAC_B],
};
const rider = quote({ existing: [paidOneAddress] });
check('a rider on a paid parcel pays ₱0', fee(rider), 0);
check('a rider records the order it rides on', rider.ok && rider.ridesOnRegistrationId, 'paid-1');
check('a ₱0 rider applies at once', rider.ok && rider.status, 'APPLIED');

const paidSplit: ExistingDelivery = {
  registrationId: 'paid-split',
  status: 'PAID',
  logisticsMethod: 'DELIVERY',
  deliveryAddress: null,
  deliverySplit: true,
  runners: [PAMPANGA, TARLAC_A],
};
check('a rider on a paid split household pays ₱0', fee(quote({ existing: [paidSplit] })), 0);
const halfRides = quote({ orders: [group], target: { deliverySplit: true }, existing: [paidSplit] });
check(
  'a split switch where both households already receive parcels pays ₱0',
  fee(halfRides),
  0,
);
check(
  'a split switch with one household riding pays only the other',
  fee(quote({ orders: [{ id: 'order-1', runners: [TARLAC_B, PAMPANGA] }], target: { deliverySplit: true }, existing: [paidSplit] })),
  INSIDE,
);

check(
  'a rider on an awaiting (PENDING) delivery pays the full fee',
  fee(quote({ existing: [{ ...paidOneAddress, status: 'PENDING' }] })),
  INSIDE,
);
check(
  'an order whose switch is only awaiting payment is still pickup, so pays the full fee',
  fee(quote({ existing: [{ ...paidOneAddress, logisticsMethod: 'PICKUP' }] })),
  INSIDE,
);
check(
  'an order cannot ride on itself',
  fee(quote({ existing: [{ ...paidOneAddress, registrationId: 'order-1' }] })),
  INSIDE,
);

// ── Refusals ─────────────────────────────────────────────────────────────────

const insideOnly = { ...event, logisticsDeliveryFeeOutside: 0 };
check(
  'a zone the event does not deliver to is refused',
  fee(quote({ event: insideOnly, orders: [{ id: 'order-1', runners: [PAMPANGA] }], target: { deliveryAddress: shipTo(PAMPANGA) } })),
  'NOT_DELIVERABLE',
);
check(
  'a split with an undelivered household is refused',
  fee(quote({ event: insideOnly, orders: [group], target: { deliverySplit: true } })),
  'NOT_DELIVERABLE',
);
check(
  'an incomplete address is refused',
  fee(quote({ target: { deliveryAddress: '' } })),
  'ADDRESS_INCOMPLETE',
);

// ── Province unknown (L5): staff pick the zone ───────────────────────────────

const noProvince = { ...event, province: null, location: 'Somewhere' };
check(
  'with no event province, the picked zone is priced',
  fee(quote({ event: noProvince, target: { deliveryAddress: shipTo(PAMPANGA), deliveryZone: 'OUTSIDE' } })),
  OUTSIDE,
);
check(
  'with no event province, no zone picked is refused',
  fee(quote({ event: noProvince, target: { deliveryAddress: shipTo(PAMPANGA) } })),
  'NOT_DELIVERABLE',
);
check(
  'with no event province, a split is refused',
  fee(quote({ event: noProvince, orders: [group], target: { deliverySplit: true } })),
  'NOT_DELIVERABLE',
);

// ── Back to pickup (L9) and the transaction fee (L7) ─────────────────────────

const back = quote({ direction: LOGISTICS_DIRECTIONS.TO_PICKUP, target: undefined });
check('back to pickup is ₱0 and applies at once', back.ok && [back.fee, back.totalCharged, back.status], [0, 0, 'APPLIED']);

const online = quote({ paymentMethod: 'QRPH' });
check(
  'online adds the transaction fee on top',
  online.ok && [online.transactionFee, online.totalCharged],
  [transactionFeeFor(INSIDE, 'QRPH'), INSIDE + transactionFeeFor(INSIDE, 'QRPH')],
);
check('online transaction fee is above zero', online.ok && online.transactionFee > 0, true);
const bank = quote({ paymentMethod: 'BANK_TRANSFER' });
check('bank transfer adds no transaction fee', bank.ok && [bank.transactionFee, bank.totalCharged], [0, INSIDE]);
check('a ₱0 rider online adds no transaction fee', (() => {
  const q = quote({ existing: [paidOneAddress], paymentMethod: 'QRPH' });
  return q.ok && [q.transactionFee, q.totalCharged];
})(), [0, 0]);

// ── Eligibility (L3, L11, L13) ───────────────────────────────────────────────

const allowed = (over: Partial<Parameters<typeof canSwitchLogistics>[0]> = {}) => {
  const answer = canSwitchLogistics({
    orderStatus: 'PAID',
    logisticsMethod: 'PICKUP',
    hasOpenSwitch: false,
    event,
    now: new Date('2026-11-01T00:00:00+08:00'),
    ...over,
  });
  return answer.allowed ? answer.direction : answer.reason;
};

check('the default deadline is 7 days before race day, 00:00 Manila',
  logisticsChangeDeadline(event)?.toISOString(), new Date('2026-11-08T00:00:00+08:00').toISOString());
check('a set deadline wins',
  logisticsChangeDeadline({ ...event, logisticsChangeUntil: '2026-11-12T23:59:00+08:00' })?.toISOString(),
  new Date('2026-11-12T23:59:00+08:00').toISOString());
check('an unreadable race day has no deadline', logisticsChangeDeadline({ date: 'soon' }), null);
check('a paid pickup order may switch to delivery', allowed(), 'TO_DELIVERY');
check('a paid delivery order may switch to pickup', allowed({ logisticsMethod: 'DELIVERY' }), 'TO_PICKUP');
check('a PENDING order is refused', allowed({ orderStatus: 'PENDING' }), 'ORDER_NOT_PAID');
check('an order with an awaiting switch is refused', allowed({ hasOpenSwitch: true }), 'OPEN_SWITCH');
check('past the default deadline is refused', allowed({ now: new Date('2026-11-08T00:00:00+08:00') }), 'PAST_DEADLINE');
check('a minute before the default deadline is allowed', allowed({ now: new Date('2026-11-07T23:59:00+08:00') }), 'TO_DELIVERY');
check(
  'past a set deadline is refused',
  allowed({ event: { ...event, logisticsChangeUntil: '2026-10-31T00:00:00+08:00' } }),
  'PAST_DEADLINE',
);
check(
  'a race without delivery refuses a switch to it',
  allowed({ event: { ...event, logisticsDeliveryFeeInside: 0, logisticsDeliveryFeeOutside: 0 } }),
  'NO_DELIVERY',
);
check(
  'a race without pickup refuses a switch to it',
  allowed({ logisticsMethod: 'DELIVERY', event: { ...event, logisticsPickup: false } }),
  'NO_PICKUP',
);

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
