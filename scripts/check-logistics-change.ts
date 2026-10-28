import {
  LOGISTICS_DIRECTIONS,
  canSwitchLogistics,
  logisticsChangeDeadline,
  quoteLogisticsChange,
  type LogisticsQuoteInput,
} from '../src/lib/logistics-change';
import { transactionFeeFor } from '../src/lib/free-checkout';
import { refsOf } from '../src/lib/logistics-change-parcels';
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
import { switchAwaitsAddress, switchHoldUntil, switchProofSubmitted } from '../src/lib/logistics-change-proof';
import type { LogisticsChangeView } from '../src/lib/logistics-change-view';
import { NO_CHANGES, NO_ORDERS, settle } from '../src/lib/settlement';
import { logisticsMove, logisticsNote, switchMoneyLine } from '../src/app/admin/events/[id]/registrants/logistics-change-display';
import { kitNote } from '../src/app/admin/your-events/[id]/RunnerCells';

/**
 * A check of the delivery switch quote (LOGISTICS_CHANGE_PLAN.md
 * Verification): one fee per order (the owner, 2026-10-21, which replaced
 * L6, R4 and R5) — a group registration's runners share one parcel, two
 * orders never do, and no address, however close to another order's paid
 * parcel, quotes ₱0 — a zone the event does not deliver to refused, back to
 * pickup free, and the deadline. Session 4 adds who is offered *Already
 * paid*, the settlement totals (a switch's fee is all the organizer's, L8),
 * and the client runner list's notes, read from a shape that carries no money.
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

// ── One fee per order (the owner, 2026-10-21; replaced L6) ──────────────────

const twoOrders = [
  { id: 'order-1', runners: [TARLAC_A] },
  { id: 'order-2', runners: [TARLAC_B] },
];
check(
  'two orders are never quoted as one parcel',
  fee(quote({ orders: twoOrders, target: { deliveryAddress: shipTo(TARLAC_A) } })),
  'MANY_ORDERS',
);
check('a group registration is one order, so its runners share one fee', fee(quote({ orders: [group] })), INSIDE);
// The quote is given no other order: whatever another receipt ships to, this
// one pays its own tier, at the same street, ZIP and landmark or not.
check(
  'the same address another order already ships to pays the full tier',
  fee(quote({ target: { deliveryAddress: shipTo(TARLAC_A, { zip: '2300', landmark: 'BLUE GATE' }) } })),
  INSIDE,
);
const sameAddress = quote({ target: { deliveryAddress: shipTo(TARLAC_A) } });
check('so it waits for payment, never applying at once', sameAddress.ok && sameAddress.status, 'AWAITING_PAYMENT');
check('the quote names no other order', sameAddress.ok && Object.keys(sameAddress).includes('ridesOnRegistrationId'), false);
check(
  'a tier the race does not price is not deliverable, so a delivery is never ₱0',
  fee(quote({ event: { ...event, logisticsDeliveryFeeInside: 0 } })),
  'NOT_DELIVERABLE',
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

// ── Naming receipts in the trail ─────────────────────────────────────────────

check('one receipt reads as itself', refsOf(['RM-A1']), 'RM-A1');
check('several read as a list', refsOf(['RM-A1', 'RM-B2', 'RM-C3']), 'RM-A1, RM-B2 and RM-C3');

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
const orders = { ...NO_ORDERS, paidOrders: 1, collected: 108_000, platformFees: 5_000, transactionFees: 3_000 };
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
const switched = (direction: string, fromLogisticsMethod: string) => ({
  status: 'APPLIED',
  direction,
  orders: [{ registrationId: 'order', fromLogisticsMethod }],
});
const noted = (isDelivery: boolean, changes: ReturnType<typeof switched>[]) => ({
  registrationId: 'order',
  isDelivery,
  logisticsChanges: changes,
});
check('a receipt switched to delivery reads "Switched from Pickup"', logisticsMove(noted(true, [switched('TO_DELIVERY', 'PICKUP')]))?.from, 'Pickup');
check(
  'switched there and back is no switch to the kit team',
  logisticsMove(noted(false, [switched('TO_DELIVERY', 'PICKUP'), switched('TO_PICKUP', 'DELIVERY')])),
  null,
);
check('the export note', kitNote({ switchedFrom: 'Pickup' }), 'Switched from pickup');
check('no switch, no note', kitNote({ switchedFrom: '' }), '');
check(
  'the registrants export never says a receipt ships with another',
  logisticsNote({
    registrationId: 'order',
    logisticsMethod: 'Delivery',
    isDelivery: true,
    logisticsChanges: [switched('TO_DELIVERY', 'PICKUP') as unknown as LogisticsChangeView],
  }),
  'SWITCHED FROM PICKUP',
);

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
  "the runner typing another order's address with their own unit and receiver still pays the full tier (vuln-0001)",
  (q => q.ok && [q.fee, q.status])(quote({ target: { deliveryAddress: withReceiver('BOB RUNNER', '+639171234567') } })),
  [INSIDE, 'AWAITING_PAYMENT'],
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

// ── Revision 3b: Ship kits is confirm and send ───────────────────────────────

const pending = { status: 'AWAITING_PAYMENT', direction: 'TO_DELIVERY', deliveryAddress: null, deliverySplit: false };
check('a switch sent with no address waits for it (T12)', switchAwaitsAddress(pending), true);
check('one with an address does not', switchAwaitsAddress({ ...pending, deliveryAddress: shipTo(TARLAC_A) }), false);
check('an applied one does not', switchAwaitsAddress({ ...pending, status: 'APPLIED' }), false);
check('back to pickup never does', switchAwaitsAddress({ ...pending, direction: 'TO_PICKUP' }), false);
check('an old split switch is not missing its address', switchAwaitsAddress({ ...pending, deliverySplit: true }), false);
const pendingView = (status: string) =>
  ({ ...pending, status, fee: 0, totalCharged: 0 }) as unknown as LogisticsChangeView;
check('the history says it waits for the address', switchMoneyLine(pendingView('AWAITING_PAYMENT')), "Waiting for the runner's address");
check('an expired one says no address came', switchMoneyLine(pendingView('EXPIRED')), 'The runner never gave an address');
check(
  'the export note says it waits for the address',
  logisticsNote({
    registrationId: 'order-1',
    logisticsMethod: 'Pickup',
    isDelivery: false,
    logisticsChanges: [{ ...pendingView('AWAITING_PAYMENT'), awaitsAddress: true, proofSubmitted: false } as LogisticsChangeView],
  }),
  'DELIVERY SWITCH AWAITING ADDRESS',
);

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
