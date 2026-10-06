import type { Prisma } from '@prisma/client';
import { formatPesos } from './money';
import { isPricedIn } from './discount';
import { formatEventDay, formatEventInstant } from './event-schedule';
import { runnerRef } from './order-ref';
import { guardianLine } from './minor-consent';
import { PICKUP_FALLBACK, pickupDetails } from './pickup';
import { formatRunnerAddress, groupByAddress } from './runner-address';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabelFor,
  isBankTransfer,
  paymentMethodLabel,
} from './registration-codes';
import {
  type EmailMessage,
  type EmailOutcome,
  type Row,
  PESO_SIGN,
  renderMessage,
  sendEmail,
} from './email-document';

/**
 * **The emails about an order**: what a runner is sent about their
 * registration. How an email is built and sent — the document model, its two
 * renderings, the Resend call and the sender — is email-document.ts; the
 * sign-in invitations are email-invitations.ts.
 *
 * Two emails go out per registration, never one:
 *  1. sendRegistrationReceivedEmail — fired the moment a registration row is
 *     created (checkout/route.ts for online methods, checkout/manual/route.ts
 *     for bank transfer), before any payment is confirmed. It exists so a
 *     runner immediately sees the details they submitted are correct, before
 *     they've even finished paying.
 *  2. sendRegistrationConfirmationEmail — fired only once status reaches
 *     PAID: from the PayMongo webhook for online payments, or from the admin
 *     status route once an admin has actually looked at a bank transfer's
 *     proof and confirmed it. A bank-transfer runner therefore never receives
 *     a receipt at submission time — only the "received" email — and gets
 *     the receipt exclusively once a human has verified their money arrived.
 *
 * Neither call needs to wait for the other on purpose: the online PayMongo
 * webhook is itself an asynchronous callback that only fires once PayMongo
 * has actually processed the payment, so "received" is always sent first —
 * at submission, before the runner has even reached PayMongo's page — and
 * the webhook's confirmation email necessarily lands after. No artificial
 * delay is needed or wanted; adding one would only tie up a serverless
 * function for no benefit.
 *
 * A third goes out only when staff send it: the payment link for an online
 * checkout that was opened and never paid (paymentLinkEmail, below).
 */

/** The exact shape every call site already queries: Registration + event + runners + category. */
export type RegistrationWithDetails = Prisma.RegistrationGetPayload<{
  include: { event: true; runners: { include: { category: true } } };
}>;

/* ────────────────────────────────────────────────────────────────────────
 * The two documents.
 * ──────────────────────────────────────────────────────────────────────── */

/** The money line's own wording, built from the shared zone label. */
function deliveryFeeLabel(registration: RegistrationWithDetails): string {
  const label = deliveryZoneLabelFor(registration.event, registration.deliveryZone);
  return label ? `Delivery — ${label}` : 'Delivery Fee';
}

/** The order block both emails open with; each adds a row or two of its own. */
function orderRows(registration: RegistrationWithDetails, extraRows: Row[]): Row[] {
  const { event } = registration;
  return [
    { kind: 'info', label: 'Order Reference', value: registration.orderRef },
    { kind: 'info', label: 'Event', value: event.title },
    { kind: 'info', label: 'Date', value: formatEventDay(event.date) },
    { kind: 'info', label: 'Location', value: event.location },
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
function logisticsRows(registration: RegistrationWithDetails): Row[] {
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
function byRunnerNo(registration: RegistrationWithDetails) {
  return [...registration.runners].sort((a, b) => a.runnerNo - b.runnerNo);
}

/** The compact runner line the receipt uses: who ran, in what, at what size. */
function runnerRows(registration: RegistrationWithDetails): Row[] {
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
  }));
}

/**
 * Every field a runner typed into the wizard, one block each. This is what
 * the "received" email shows — the receipt keeps the compact line above,
 * since by then the runner has already had a chance to catch a typo here.
 */
function runnerDetailRows(registration: RegistrationWithDetails): Row[] {
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
 */
function summaryRows(registration: RegistrationWithDetails, totalLabel: string): Row[] {
  const discounted = registration.discountAmount > 0;
  const pricedIn = discounted && isPricedIn(registration.discountType);
  const promoName = registration.promoCode ?? 'Promotion';

  return [
    {
      kind: 'amount',
      label: pricedIn ? `Subtotal (${promoName} price)` : 'Subtotal',
      centavos: pricedIn
        ? registration.subtotal - registration.discountAmount
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
            centavos: -registration.discountAmount,
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
            value: `${PESO_SIGN}${formatPesos(registration.discountAmount)} on ${promoName}`,
          },
        ]
      : []),
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

/**
 * Sent the moment a registration is created — before any payment is
 * confirmed. Shows the runner exactly what they submitted (so a typo in a
 * name or a wrong category jumps out immediately) and what happens next; it
 * deliberately does not claim the money has been received, only that the
 * registration has.
 */
export function registrationReceivedEmail(registration: RegistrationWithDetails): Promise<EmailMessage> {
  const { event } = registration;
  const paidByBankTransfer = isBankTransfer(registration.paymentMethod);
  const firstName = registration.customerName.split(' ')[0] || registration.customerName;

  const nextStep = paidByBankTransfer
    ? "Our team will verify your proof of payment and email you an official receipt once it's confirmed."
    : "Once your payment is confirmed, we'll email you an official receipt.";

  return renderMessage({
    to: registration.customerEmail,
    // The order reference keeps every email its own conversation. Without it
    // Gmail threads same-subject messages together and hides the body behind
    // "Show trimmed content" as if it were a quoted reply.
    subject: `We've received your registration — ${event.title} (${registration.orderRef})`,
    status: { label: 'Registration Received', tone: 'pending' },
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, we've received your registration for `,
          { strong: event.title },
          ". Here's what you submitted — please check every detail below carefully, especially each runner's info.",
        ],
      },
      { kind: 'heading', text: 'Order Details' },
      {
        kind: 'card',
        rows: orderRows(registration, [
          { kind: 'info', label: 'Submitted By', value: registration.customerName },
          { kind: 'info', label: 'Contact Email', value: registration.customerEmail },
          ...(registration.customerPhone
            ? [{ kind: 'info' as const, label: 'Contact Phone', value: registration.customerPhone }]
            : []),
          ...logisticsRows(registration),
          ...(paidByBankTransfer && registration.transactionNumber
            ? [{ kind: 'info' as const, label: 'Transaction No.', value: registration.transactionNumber }]
            : []),
        ]),
      },
      { kind: 'heading', text: 'Runner Details — Please Verify' },
      { kind: 'card', rows: runnerDetailRows(registration) },
      { kind: 'heading', text: 'Order Summary' },
      { kind: 'rows', rows: summaryRows(registration, paidByBankTransfer ? 'Amount Due' : 'Total Amount') },
      {
        kind: 'note',
        segments: [`${nextStep} If anything above looks wrong, reply to this email right away.`],
      },
    ],
  });
}

/**
 * Sent once a registration reaches PAID — online via the PayMongo webhook, or
 * manual once an admin confirms a bank transfer proof. This is the official
 * receipt. A bank transfer already had the received email above, so its
 * receipt is about the money and keeps the compact runner line. Every other
 * order (online, free) never got that email, so its receipt also carries the
 * contact, logistics and full per-runner details.
 */
export function registrationConfirmationEmail(registration: RegistrationWithDetails): Promise<EmailMessage> {
  const { event, runners } = registration;
  const paidByBankTransfer = isBankTransfer(registration.paymentMethod);
  const firstName = registration.customerName.split(' ')[0] || registration.customerName;

  return renderMessage({
    to: registration.customerEmail,
    subject: `Payment confirmed — ${event.title} (${registration.orderRef})`,
    status: { label: paidByBankTransfer ? 'Payment Verified' : 'Payment Confirmed', tone: 'success' },
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, ${
            paidByBankTransfer
              ? "we've verified your bank transfer — you're officially registered for "
              : "your payment went through — you're officially registered for "
          }`,
          { strong: event.title },
          ". Here's your receipt.",
        ],
      },
      { kind: 'heading', text: 'Order Details' },
      {
        kind: 'card',
        rows: orderRows(
          registration,
          paidByBankTransfer
            ? registration.transactionNumber
              ? [{ kind: 'info', label: 'Transaction No.', value: registration.transactionNumber }]
              : []
            : [
                // Only a bank transfer gets the "received" email first; for
                // every other order this receipt is the one email, so it
                // carries what that one would have shown.
                { kind: 'info', label: 'Submitted By', value: registration.customerName },
                { kind: 'info', label: 'Contact Email', value: registration.customerEmail },
                ...(registration.customerPhone
                  ? [{ kind: 'info' as const, label: 'Contact Phone', value: registration.customerPhone }]
                  : []),
                ...logisticsRows(registration),
              ]
        ),
      },
      { kind: 'heading', text: `Registered Runner${runners.length > 1 ? 's' : ''}` },
      paidByBankTransfer
        ? { kind: 'rows', rows: runnerRows(registration) }
        : { kind: 'card', rows: runnerDetailRows(registration) },
      { kind: 'heading', text: 'Payment Summary' },
      { kind: 'rows', rows: summaryRows(registration, 'Total Paid') },
      {
        kind: 'note',
        segments: [
          'Keep this email as your receipt. Results and your e-certificate will be posted here once the race is done.',
        ],
      },
    ],
  });
}

/**
 * The two sends. Each reports whether it actually happened; lib/email-delivery.ts
 * is what writes that onto the registration, and the call sites go through it
 * rather than calling these directly.
 */
export function sendRegistrationReceivedEmail(
  registration: RegistrationWithDetails
): Promise<EmailOutcome> {
  return registrationReceivedEmail(registration).then(sendEmail);
}

export function sendRegistrationConfirmationEmail(
  registration: RegistrationWithDetails
): Promise<EmailOutcome> {
  return registrationConfirmationEmail(registration).then(sendEmail);
}

/**
 * The payment link (UNPAID_FOLLOWUP_PLAN.md Batch 4): sent by staff, never on
 * a timer, to a runner whose online checkout was opened and never paid, so
 * they can finish paying without registering again. `url` is the
 * resume-payment link (lib/resume-payment.ts); `until` is when it stops
 * working, which is when the order lets go of its slot (`expiresBy`).
 *
 * It says plainly that nothing is confirmed yet and when the hold ends,
 * because a runner who thinks they are registered does not pay. It carries
 * the order and the amount so they can see what they are paying for before
 * they press anything, and the one button is the link. Nothing here is more
 * than the received email already showed the same address.
 */
export function paymentLinkEmail(
  registration: RegistrationWithDetails,
  url: string,
  until: Date,
): Promise<EmailMessage> {
  const { event, runners } = registration;
  const firstName = registration.customerName.split(' ')[0] || registration.customerName;
  const untilLabel = formatEventInstant(until);

  return renderMessage({
    to: registration.customerEmail,
    // The reference keeps it its own thread, as the other order emails do.
    subject: `Finish your registration — ${event.title} (${registration.orderRef})`,
    status: { label: 'Payment Pending', tone: 'pending' },
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, your registration for `,
          { strong: event.title },
          ' is not paid yet, so it is not confirmed. We are holding your slot until ',
          { strong: `${untilLabel}, Manila time` },
          '. Finish paying below to keep it.',
        ],
      },
      { kind: 'button', label: 'Finish Payment', href: url },
      { kind: 'heading', text: 'Your Order' },
      { kind: 'card', rows: orderRows(registration, []) },
      { kind: 'heading', text: `Runner${runners.length > 1 ? 's' : ''}` },
      { kind: 'rows', rows: runnerRows(registration) },
      { kind: 'heading', text: 'Order Summary' },
      { kind: 'rows', rows: summaryRows(registration, 'Amount Due') },
      {
        kind: 'note',
        segments: [
          `The link opens a secure PayMongo page for this order only, and works until ${untilLabel}, Manila time. After that the slot is released and you would need to register again. Already paid? Reply with your order reference and we will check.`,
        ],
      },
    ],
  });
}

/**
 * Sent as rendered, so the route that sends it holds the same message to hand
 * a staff member by hand when Resend refuses it. Its outcome goes on the
 * audit trail, not on the registration's email columns: those record the
 * emails an order is owed, and nobody is owed this one.
 */
export function sendPaymentLinkEmail(message: EmailMessage): Promise<EmailOutcome> {
  return sendEmail(message);
}
