/**
 * **The rows an order email is made of**: the order block, pickup or
 * delivery, each runner, and the money with its total. Split out of
 * `email.ts` (ADD_ONS_PLAN.md Batch 4), which was on the split-candidates
 * list, when the runners and the money gained add-on lines; `email.ts` keeps
 * the three documents that put these rows together.
 *
 * **The money lines sum to the total.** `totalAmount = subtotal − discount +
 * addOnTotal + deliveryFee + platformFee + transactionFee` (ADD_ONS_PLAN.md),
 * so every add-on line is printed as its own amount, worded as the wizard's
 * summary and the PayMongo page worded it (`addOnLineLabel`), and the runner
 * can add the receipt up to what they were charged.
 */

import type { Prisma } from '@prisma/client';
import { formatPesos } from './money';
import { isPricedIn } from './discount';
import { formatEventDay, formatEventRange } from './event-schedule';
import { VIRTUAL_RUN_WHERE, isVirtual } from './event-format';
import { runnerRef } from './order-ref';
import { guardianLine } from './minor-consent';
import { PICKUP_FALLBACK, pickupDetails } from './pickup';
import { formatRunnerAddress, groupByAddress } from './runner-address';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabelFor,
  paymentMethodLabel,
} from './registration-codes';
import { type Row, PESO_SIGN } from './email-document';
import { ADD_ON_LINES_READ, addOnItemLabel, addOnLineLabel } from './add-ons';

/**
 * What every email call site queries: the event, and the live runners with
 * their category and add-on lines. One include, so a route that sends one of
 * these emails cannot leave the add-ons out and send a receipt whose lines
 * fall short of its total.
 */
export const EMAIL_RUNNER_INCLUDE = { category: true, addOns: ADD_ON_LINES_READ } as const;

/** The shape every call site queries: Registration + event + runners + category + add-ons. */
export type RegistrationWithDetails = Prisma.RegistrationGetPayload<{
  include: { event: true; runners: { include: typeof EMAIL_RUNNER_INCLUDE } };
}>;

/** The money line's own wording, built from the shared zone label. */
function deliveryFeeLabel(registration: RegistrationWithDetails): string {
  const label = deliveryZoneLabelFor(registration.event, registration.deliveryZone);
  return label ? `Delivery — ${label}` : 'Delivery Fee';
}

/** The order block both emails open with; each adds a row or two of its own. */
export function orderRows(registration: RegistrationWithDetails, extraRows: Row[]): Row[] {
  const { event } = registration;
  return [
    { kind: 'info', label: 'Order Reference', value: registration.orderRef },
    { kind: 'info', label: 'Event', value: event.title },
    // A virtual run has no race day or venue (VIRTUAL_RUN_PLAN.md): the
    // runner is told the window they may run in, and that it is anywhere.
    ...(isVirtual(event)
      ? ([
          { kind: 'info', label: 'Run Window', value: formatEventRange(event.date, event.virtualEndDate) },
          { kind: 'info', label: 'Where', value: VIRTUAL_RUN_WHERE },
        ] as Row[])
      : ([
          { kind: 'info', label: 'Date', value: formatEventDay(event.date) },
          { kind: 'info', label: 'Location', value: event.location },
        ] as Row[])),
    { kind: 'info', label: 'Payment Method', value: paymentMethodLabel(registration.paymentMethod) },
    ...extraRows,
  ];
}

/**
 * Pickup or delivery, as order rows.
 *
 * Pickup carries the organizer's address and hours (lib/pickup.ts) rather than
 * the bare word "Pickup": this email is what the runner still has in their
 * inbox on race week, and "Pickup at Venue" does not tell them which venue.
 * When the organizer has not settled it yet, the fallback sentence says so —
 * an empty row would read as though we simply forgot.
 */
export function logisticsRows(registration: RegistrationWithDetails): Row[] {
  if (asLogisticsMethod(registration.logisticsMethod) !== LOGISTICS_METHODS.DELIVERY) {
    const { location, schedule } = pickupDetails(registration.event);
    const rows: Row[] = [{ kind: 'info', label: 'Logistics', value: 'Race Kit Pickup' }];
    if (!location && !schedule) rows.push({ kind: 'info', label: 'Pickup Details', value: PICKUP_FALLBACK });
    if (location) rows.push({ kind: 'info', label: 'Pickup Location', value: location });
    if (schedule) rows.push({ kind: 'info', label: 'Pickup Schedule', value: schedule });
    return rows;
  }
  if (registration.deliverySplit) return splitDeliveryRows(registration);
  const zoneLabel = deliveryZoneLabelFor(registration.event, registration.deliveryZone) || 'Delivery';
  const value = registration.deliveryAddress ? `${zoneLabel} — ${registration.deliveryAddress}` : zoneLabel;
  return [{ kind: 'info', label: 'Delivery', value }];
}

/**
 * A split delivery ships each kit to its runner's home address, one parcel
 * per household (RUNNER_ADDRESS_PLAN.md Batch 2), so the email says which
 * runners share which parcel rather than printing one address.
 */
function splitDeliveryRows(registration: RegistrationWithDetails): Row[] {
  const runners = byRunnerNo(registration);
  const shipments = groupByAddress(runners);
  return shipments.map((shipment, i) => {
    const names = shipment.runners
      .map((r) => `${runners[r].firstName} ${runners[r].lastName}`)
      .join(', ');
    return {
      kind: 'info',
      label: `Delivery ${i + 1} of ${shipments.length}`,
      value: `${names} — ${formatRunnerAddress(shipment.address)}`,
    };
  });
}

/**
 * The runners in their order-reference order.
 *
 * A Prisma include gives no ordering guarantee, and these rows are labelled
 * with a number a runner will quote back at us — so the list is sorted by the
 * stored position rather than by however the rows arrived.
 */
export function byRunnerNo(registration: RegistrationWithDetails) {
  return [...registration.runners].sort((a, b) => a.runnerNo - b.runnerNo);
}

/** The compact runner line the receipt uses: who ran, in what, at what size. */
export function runnerRows(registration: RegistrationWithDetails): Row[] {
  const runners = byRunnerNo(registration);
  return runners.map(runner => ({
    kind: 'runner' as const,
    name: `${runner.firstName} ${runner.lastName}`,
    reference: runnerRef(registration.orderRef, runner.runnerNo, runners.length),
    category: runner.category.name,
    community: runner.runningCommunity || null,
    size: runner.singletSize || null,
    // Only a minor has one (lib/minor-consent.ts storedGuardianConsent writes
    // nulls for everyone else), so its presence is the test.
    guardian: guardianLine(runner.guardianName, runner.guardianRelationship),
    // What this runner bought with their entry (ADD_ONS_PLAN.md D3), under
    // their own name; the money is in the summary below.
    addOns: runner.addOns.map(addOnItemLabel),
  }));
}

/**
 * Every field a runner typed into the wizard, one block each. This is what
 * the "received" email shows — the receipt keeps the compact line above,
 * since by then the runner has already had a chance to catch a typo here.
 */
export function runnerDetailRows(registration: RegistrationWithDetails): Row[] {
  const runners = byRunnerNo(registration);
  return runners.flatMap((runner, index): Row[] => {
    const heading =
      runners.length > 1
        ? `Runner ${runner.runnerNo} — ${runner.firstName} ${runner.lastName}`
        : `${runner.firstName} ${runner.lastName}`;

    return [
      { kind: 'runnerHeading', text: heading, first: index === 0 },
      {
        kind: 'info',
        label: 'Runner Reference',
        value: runnerRef(registration.orderRef, runner.runnerNo, runners.length),
      },
      { kind: 'info', label: 'Category', value: runner.category.name },
      ...(runner.singletSize ? [{ kind: 'info' as const, label: 'Shirt Size', value: runner.singletSize }] : []),
      // Beside the shirt size, so a wrong size on a shirt they paid for is
      // caught here too.
      ...runner.addOns.map(line => ({ kind: 'info' as const, label: 'Add-on', value: addOnItemLabel(line) })),
      { kind: 'info', label: 'Gender', value: runner.gender },
      { kind: 'info', label: 'Birthdate', value: runner.birthdate },
      // The guardian who consented, under the details of the minor they
      // consented for — so a parent reading the email sees their own name on
      // record, and a typo in it can be caught now rather than at kit claiming.
      ...(() => {
        const guardian = guardianLine(runner.guardianName, runner.guardianRelationship);
        return guardian ? [{ kind: 'info' as const, label: 'Parent/Guardian', value: guardian }] : [];
      })(),
      { kind: 'info', label: 'Email', value: runner.email },
      { kind: 'info', label: 'Phone', value: runner.phone },
      {
        kind: 'info',
        label: 'Emergency Contact',
        value: `${runner.emergencyContactName} (${runner.emergencyContactPhone})`,
      },
      ...(runner.medicalConditions
        ? [{ kind: 'info' as const, label: 'Medical Conditions', value: runner.medicalConditions }]
        : []),
      { kind: 'info', label: 'Running Community', value: runner.runningCommunity },
    ];
  });
}

/**
 * The cost breakdown and its total. Only the last line's wording differs.
 *
 * **A sale is a price, not a deduction**, and this email has to say it the way
 * the wizard's summary did — a runner who was shown ₱900 a race and then reads
 * a receipt quoting ₱1,200 with a credit underneath will believe they were
 * charged the higher number. So a priced-in promotion nets the Subtotal line
 * and replaces the discount row with a note naming it; every other kind leaves
 * the goods at list and shows itself as the negative row it is. Which one it
 * was is read off `Registration.discountType`, snapshotted at checkout,
 * because the promotion it came from may have been edited or deleted between
 * then and now.
 *
 * The stored row is untouched by any of this: `subtotal` is the list total and
 * `discountAmount` what came off it, whichever way they are printed, so the
 * organizer's revenue and the *Given* column keep counting the same money.
 *
 * **A combined order has two promotions** (`Registration.combinedPromoCode`):
 * the price promotion is printed exactly as above with its own share, and the
 * group deal it was combined with is a line off the order with its own —
 * the two shares together are `discountAmount`.
 */
export function summaryRows(registration: RegistrationWithDetails, totalLabel: string): Row[] {
  const combinedOff = registration.combinedPromoCode ? registration.combinedDiscountAmount : 0;
  // The price promotion's own share: the whole discount on every other order.
  const ownOff = registration.discountAmount - combinedOff;
  const discounted = ownOff > 0;
  const pricedIn = discounted && isPricedIn(registration.discountType);
  const promoName = registration.promoCode ?? 'Promotion';

  return [
    {
      kind: 'amount',
      label: pricedIn ? `Subtotal (${promoName} price)` : 'Subtotal',
      centavos: pricedIn
        ? registration.subtotal - ownOff
        : registration.subtotal,
    },
    ...(registration.deliveryFee > 0
      ? [
          {
            kind: 'amount' as const,
            label: deliveryFeeLabel(registration),
            centavos: registration.deliveryFee,
          },
        ]
      : []),
    // Directly under the goods it came off, and before the fees, because that
    // is the order the wizard's summary showed it in and this email is what
    // the runner checks the charge against.
    ...(discounted && !pricedIn
      ? [
          {
            kind: 'amount' as const,
            label: registration.promoCode
              ? `Discount (${registration.promoCode})`
              : 'Discount',
            centavos: -ownOff,
          },
        ]
      : []),
    ...(combinedOff > 0
      ? [
          {
            kind: 'amount' as const,
            label: `Discount (${registration.combinedPromoCode})`,
            centavos: -combinedOff,
          },
        ]
      : []),
    // The saving is still stated when it is priced in — it is the whole reason
    // the subtotal above is what it is — but as a fact rather than as a second
    // subtraction, which would take it off twice.
    ...(pricedIn
      ? [
          {
            kind: 'info' as const,
            label: 'You saved',
            value: `${PESO_SIGN}${formatPesos(ownOff)} on ${promoName}`,
          },
        ]
      : []),
    // Each runner's add-ons, a line each and at their price (D5: no promotion
    // touches them), after the discounts that came off the entries alone and
    // before the fees, the order the wizard's summary showed them in.
    ...addOnAmountRows(registration),
    ...(registration.platformFee > 0
      ? [{ kind: 'amount' as const, label: 'Platform Fee', centavos: registration.platformFee }]
      : []),
    ...(registration.transactionFee > 0
      ? [{ kind: 'amount' as const, label: 'Transaction Fee', centavos: registration.transactionFee }]
      : []),
    { kind: 'rule' },
    { kind: 'total', label: totalLabel, centavos: registration.totalAmount },
  ];
}

/** One money line per add-on line, labelled with its runner: `Runner 2 · CAP × 1`. */
function addOnAmountRows(registration: RegistrationWithDetails): Row[] {
  return byRunnerNo(registration).flatMap(runner =>
    runner.addOns.map(line => ({
      kind: 'amount' as const,
      label: addOnLineLabel({ ...line, runnerNo: runner.runnerNo }),
      centavos: line.unitPrice * line.quantity,
    })),
  );
}
