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
  parcelAddressesOf,
  ridersOf,
  ridersRefusal,
  waitingConflict,
  waitingRefusal,
  type AppliedLink,
} from '../src/lib/logistics-change-parcels';
import {
  composeDeliveryAddress,
  deliveryAddressDetails,
  EMPTY_DELIVERY_ADDRESS,
} from '../src/app/events/[slug]/register/delivery-address';
import {
  CHANGE_PAYMENT_CHOICES,
  changePayableState,
  paymentMethodForChoice,
  switchPaymentChoices,
} from '../src/lib/category-change-hold';
import { switchHoldUntil, switchProofSubmitted } from '../src/lib/logistics-change-proof';
import type { LogisticsChangeView } from '../src/lib/logistics-change-view';
import { NO_CHANGES, NO_ORDERS, settle } from '../src/lib/settlement';
import { logisticsMove, logisticsNote, shipsWith } from '../src/app/admin/events/[id]/registrants/logistics-change-display';
import { kitNote } from '../src/app/admin/your-events/[id]/RunnerCells';

/**
 * A check of the delivery switch quote (LOGISTICS_CHANGE_PLAN.md
 * Verification): one fee per parcel across the orders switched, ₱0 when the
 * address already receives a PAID delivery and never when it only awaits
 * payment, a zone the event does not deliver to refused, back to pickup free,
 * the deadline, and Revision 1's two refusals: a second receipt to an address
 * still waiting for payment (R4), and a parcel others ride on going back
 * before them (R5). Session 4 adds who is offered *Already paid*, the
 * settlement totals (a switch's fee is all the organizer's, L8), and the
 * client runner list's notes, read from a shape that carries no money.
 *
 * There is no test runner in this project, so this is a script rather than a
 * spec. It touches no database and needs no environment. Run it with the
 * alias the module imports through, since jiti does not read tsconfig paths,
 * and with JSX on, since the display helpers it checks live in .tsx files:
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     $env:JITI_JSX='1'
 *     npx jiti scripts/check-logistics-change.ts
 *
 *   Git Bash (the alias must be the Windows path; "$PWD" is a /c/... one):
 *     JITI_JSX=1 JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}' npx jiti scripts/check-logistics-change.ts
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
// Per-runner shipping was removed (2026-10-20): a group whose runners live
// apart still ships as one parcel to the one address, and is never split.
const oneParcel = quote({ orders: [group], target: { deliveryAddress: shipTo(TARLAC_A) } });
check('a group living apart still makes one parcel', oneParcel.ok && oneParcel.parcels.length, 1);
check(
  'a group switch stores its one address, never split',
  oneParcel.ok && [oneParcel.deliveryAddress, oneParcel.deliverySplit],
  [shipTo(TARLAC_A), false],
);

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

// ── Revision 1: an address waiting for payment (R4) ──────────────────────────

const waitingTo = (address: typeof TARLAC_A, over: { split?: boolean; runners?: (typeof TARLAC_A)[] } = {}) => ({
  orderRef: 'RM-WAIT',
  registrationIds: ['order-9'],
  deliveryAddress: over.split ? null : shipTo(address),
  deliverySplit: over.split ?? false,
  runners: over.runners ?? [address],
});
const toA = quote({});
check(
  'a fee to an address another receipt waits on is refused with its reference',
  toA.ok && waitingConflict(toA.parcels, [waitingTo(TARLAC_A)], 'order-1'),
  'RM-WAIT',
);
check(
  'the same address with another ZIP and landmark still counts',
  toA.ok && waitingConflict(toA.parcels, [{ ...waitingTo(TARLAC_A), deliveryAddress: shipTo(TARLAC_A, { zip: '2300', landmark: 'NEAR THE CHURCH' }) }], 'order-1'),
  'RM-WAIT',
);
check('another address is not refused', toA.ok && waitingConflict(toA.parcels, [waitingTo(TARLAC_B)], 'order-1'), null);
check(
  "a split waiting switch's household counts as its address",
  toA.ok && waitingConflict(toA.parcels, [waitingTo(TARLAC_B, { split: true, runners: [TARLAC_B, TARLAC_A] })], 'order-1'),
  'RM-WAIT',
);
check(
  'a receipt is never refused by its own waiting switch',
  toA.ok && waitingConflict(toA.parcels, [{ ...waitingTo(TARLAC_A), registrationIds: ['order-1'] }], 'order-1'),
  null,
);
const riding = quote({ existing: [paidOneAddress] });
check(
  'a parcel riding free on a paid one is not refused',
  riding.ok && waitingConflict(riding.parcels, [waitingTo(TARLAC_A)], 'order-1'),
  null,
);
check(
  "R4's sentence",
  waitingRefusal('RM-WAIT'),
  'RM-WAIT is waiting for payment for delivery to this address. Switch this receipt once that is paid, and it ships free.',
);
check('a split order has one parcel per household', parcelAddressesOf({ deliveryAddress: null, deliverySplit: true, runners: [TARLAC_A, TARLAC_B, TARLAC_A] }).length, 2);

// ── Revision 1: riders go back first (R5) ────────────────────────────────────

const link = (registrationId: string, over: Partial<AppliedLink> = {}): AppliedLink => ({
  registrationId,
  status: 'PAID',
  logisticsMethod: 'DELIVERY',
  direction: 'TO_DELIVERY',
  ridesOnRegistrationId: 'host',
  at: 1,
  ...over,
});
check('a receipt riding on the host is its rider', ridersOf([link('rider')], ['host']), ['rider']);
check('a rider of a rider counts too', ridersOf([link('rider'), link('second', { ridesOnRegistrationId: 'rider' })], ['host']), ['rider', 'second']);
check(
  'a rider since switched back to pickup rides on nothing',
  ridersOf([link('rider'), link('rider', { direction: 'TO_PICKUP', ridesOnRegistrationId: null, at: 2, logisticsMethod: 'PICKUP' })], ['host']),
  [],
);
check('a cancelled rider order rides on nothing', ridersOf([link('rider', { status: 'CANCELLED' })], ['host']), []);
check(
  "R5's sentence",
  ridersRefusal(['RM-RIDER']),
  'RM-RIDER ships with this receipt at no charge. Switch RM-RIDER back to pickup first.',
);


// ── Already paid, record it now (the owner's addition to Session 4) ─────────

const OUTSIDE_PAID = CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID;
check('already paid is offered on a bank order to staff who record payments', switchPaymentChoices('BANK_TRANSFER', true).includes(OUTSIDE_PAID), true);
check('already paid is offered on an online order too: the money is already in', switchPaymentChoices('QRPH', true).includes(OUTSIDE_PAID), true);
check('already paid is not offered to staff who cannot record a payment', switchPaymentChoices('BANK_TRANSFER', false).includes(OUTSIDE_PAID), false);
check(
  'the other choices still follow the entry',
  switchPaymentChoices('BANK_TRANSFER', true),
  [CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER, OUTSIDE_PAID],
);
check('already paid is stored as a bank transfer', paymentMethodForChoice(OUTSIDE_PAID), 'BANK_TRANSFER');
check('its quote carries no transaction fee', fee(quote({ paymentMethod: paymentMethodForChoice(OUTSIDE_PAID) })), INSIDE);

// ── Settlement: delivery switches (L8) ───────────────────────────────────────

// One PAID order: ₱1,000 entry + ₱50 platform + ₱30 transaction.
const orders = { paidOrders: 1, collected: 108_000, platformFees: 5_000, transactionFees: 3_000 };
const before = settle(orders, 0);
check('without switches, owed is the entry', before.owed, 100_000);
check('without switches, the line is empty', before.switches.switches, 0);

const bankSwitch = { switches: 1, charged: INSIDE, fees: INSIDE, transactionFees: 0 };
const afterBank = settle(orders, 0, NO_CHANGES, bankSwitch);
check('a recorded switch adds its fee to collected', afterBank.collected - before.collected, INSIDE);
check('a recorded switch adds exactly its fee to owed (L8)', afterBank.owed - before.owed, INSIDE);
check('a switch adds nothing to Run As One (L7)', afterBank.platformFees, before.platformFees);
check('the line names the fee', afterBank.switches.owed, INSIDE);

const onlineFee = transactionFeeFor(INSIDE, 'QRPH');
const onlineSwitch = { switches: 1, charged: INSIDE + onlineFee, fees: INSIDE, transactionFees: onlineFee };
const afterOnline = settle(orders, 0, NO_CHANGES, onlineSwitch);
check("an online switch's transaction fee is processing", afterOnline.transactionFees - before.transactionFees, onlineFee);
check('an online switch still adds exactly its fee to owed', afterOnline.owed - before.owed, INSIDE);
check(
  'collected = platform + processing + owed',
  afterOnline.collected,
  afterOnline.platformFees + afterOnline.transactionFees + afterOnline.owed,
);
check('a paid switch alone is not "No Orders"', settle(NO_ORDERS, 0, NO_CHANGES, bankSwitch).state, 'DUE');
check('the balance moves by the fee', afterBank.balance - before.balance, INSIDE);

// ── The client's runner list: notes without money (Session 4) ───────────────

// The shape client-runners.ts builds from its select: no amount, payment or reason.
const switched = (direction: string, ridesOnOrderRef: string | null, fromLogisticsMethod: string) => ({
  status: 'APPLIED',
  direction,
  ridesOnOrderRef,
  orders: [{ registrationId: 'order', fromLogisticsMethod }],
});
const noted = (isDelivery: boolean, changes: ReturnType<typeof switched>[]) => ({
  registrationId: 'order',
  isDelivery,
  logisticsChanges: changes,
});
check('a receipt switched to delivery reads "Switched from Pickup"', logisticsMove(noted(true, [switched('TO_DELIVERY', null, 'PICKUP')]))?.from, 'Pickup');
check('a rider reads "Ships with" its host', shipsWith(noted(true, [switched('TO_DELIVERY', 'RM-HOST', 'PICKUP')])), 'RM-HOST');
check(
  'switched there and back is no switch to the kit team',
  logisticsMove(noted(false, [switched('TO_DELIVERY', 'RM-HOST', 'PICKUP'), switched('TO_PICKUP', null, 'DELIVERY')])),
  null,
);
check(
  'a rider back on pickup ships with nothing',
  shipsWith(noted(false, [switched('TO_DELIVERY', 'RM-HOST', 'PICKUP'), switched('TO_PICKUP', null, 'DELIVERY')])),
  null,
);
check('the export note', kitNote({ switchedFrom: 'Pickup', shipsWith: 'RM-HOST' }), 'Switched from pickup · Ships with RM-HOST');

// ── Ship kits like the wizard: another receiver (the owner, 2026-10-20) ─────

const withReceiver = (receiverName: string, receiverPhone: string) =>
  composeDeliveryAddress({
    ...EMPTY_DELIVERY_ADDRESS,
    street: TARLAC_A.addressStreet,
    barangay: TARLAC_A.addressBarangay,
    city: TARLAC_A.addressCity,
    province: TARLAC_A.addressProvince,
    zip: '2300',
    landmark: 'BLUE GATE',
    otherReceiver: true,
    receiverName,
    receiverPhone,
  });
const toReceiver = quote({ target: { deliveryAddress: withReceiver('MARIA SANTOS', '+639171234567') } });
check('a receiver is quoted like any address', fee(toReceiver), INSIDE);
check(
  'the receiver is stored in the address, as at checkout',
  toReceiver.ok && toReceiver.deliveryAddress,
  'BLK 5 RIZAL ST., SAN ISIDRO, TARLAC CITY, TARLAC 2300 — LANDMARK: BLUE GATE — RECEIVER: MARIA SANTOS, +639171234567',
);
check(
  'a receiver with no mobile is refused',
  (r => !r.ok && r.reason)(quote({ target: { deliveryAddress: withReceiver('MARIA SANTOS', '') } })),
  'ADDRESS_INCOMPLETE',
);
check(
  'a receiver does not change which parcel it is (L6)',
  fee(quote({ existing: [paidOneAddress], target: { deliveryAddress: withReceiver('MARIA SANTOS', '+639171234567') } })),
  0,
);
check(
  'a receiver does not change which waiting switch it meets (R4)',
  toReceiver.ok && waitingConflict(toReceiver.parcels, [waitingTo(TARLAC_A)], 'order-1'),
  'RM-WAIT',
);
check('the emails read the address apart from its receiver', deliveryAddressDetails(withReceiver('MARIA SANTOS', '+639171234567')), {
  place: 'BLK 5 RIZAL ST., SAN ISIDRO, TARLAC CITY, TARLAC 2300',
  landmark: 'BLUE GATE',
  receiver: { name: 'MARIA SANTOS', phone: '+639171234567' },
});
check('no receiver reads as none', deliveryAddressDetails(shipTo(TARLAC_A)).receiver, null);

// ── Revision 3: the runner confirms on the link ─────────────────────────────

// T2: the link re-quotes the address the runner gives, by the same rules.
check('the runner moving the address to another tier re-prices it', fee(quote({ target: { deliveryAddress: shipTo(PAMPANGA) } })), OUTSIDE);
check(
  'the runner moving the address onto a paid parcel rides free and applies',
  (q => q.ok && [q.fee, q.status, q.ridesOnRegistrationId])(quote({ existing: [paidOneAddress], target: { deliveryAddress: shipTo(TARLAC_A) } })),
  [0, 'APPLIED', 'paid-1'],
);
check(
  'an online re-quote carries the transaction fee for the new tier',
  (q => q.ok && q.transactionFee)(quote({ paymentMethod: 'QRPH', target: { deliveryAddress: shipTo(PAMPANGA) } })),
  transactionFeeFor(OUTSIDE, 'QRPH'),
);

// T5, T6: proof submitted, and the hold it stops.
const lapsedHold = new Date('2026-11-01T00:00:00+08:00');
const afterHold = new Date('2026-11-03T00:00:00+08:00');
const deadline = new Date('2026-11-08T00:00:00+08:00');
type ProofCase = { status: string; paymentMethod: string; proofOfPayment: string | null; holdUntil: Date };
const waitingBank: ProofCase = { status: 'AWAITING_PAYMENT', paymentMethod: 'BANK_TRANSFER', proofOfPayment: null, holdUntil: lapsedHold };
const withProof: ProofCase = { ...waitingBank, proofOfPayment: 'proofs/slip.jpg' };
check('a waiting bank switch with a proof is proof submitted', switchProofSubmitted(withProof), true);
check('without a proof it is not', switchProofSubmitted(waitingBank), false);
check('an online switch is never proof submitted', switchProofSubmitted({ ...withProof, paymentMethod: 'QRPH' }), false);
check('an applied switch is not proof submitted', switchProofSubmitted({ ...withProof, status: 'APPLIED' }), false);
check('proof stops the hold (T6)', switchHoldUntil(withProof), null);
check('no proof keeps the hold', switchHoldUntil(waitingBank), lapsedHold);
const payable = (c: ProofCase, now: Date) =>
  changePayableState({ status: c.status, holdUntil: switchHoldUntil(c) }, deadline, now);
check('past its hold without proof, a switch expires', payable(waitingBank, afterHold), 'expired');
check('past its hold with proof, it still waits for staff', payable(withProof, afterHold), 'payable');
check('past the deadline, even with proof, it expires', payable(withProof, new Date('2026-11-09T00:00:00+08:00')), 'expired');

// T8: the registrants export says the proof is in.
check(
  'the export note says proof submitted',
  logisticsNote({
    registrationId: 'order-1',
    logisticsMethod: 'Pickup',
    isDelivery: false,
    logisticsChanges: [
      { status: 'AWAITING_PAYMENT', proofSubmitted: true, totalCharged: INSIDE, fee: INSIDE } as LogisticsChangeView,
    ],
  }),
  'DELIVERY SWITCH PROOF SUBMITTED',
);

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
