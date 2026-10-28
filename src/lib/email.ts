import { formatEventInstant } from './event-schedule';
import { emailedTrackUrl } from './track-link';
import { isBankTransfer } from './registration-codes';
import {
  type EmailMessage,
  type EmailOutcome,
  renderMessage,
  sendEmail,
} from './email-document';
import {
  type RegistrationWithDetails,
  logisticsRows,
  orderRows,
  runnerDetailRows,
  runnerRows,
  summaryRows,
} from './email-order-rows';

export { EMAIL_RUNNER_INCLUDE, type RegistrationWithDetails } from './email-order-rows';

/**
 * **The emails about an order**: what a runner is sent about their
 * registration. How an email is built and sent — the document model, its two
 * renderings, the Resend call and the sender — is email-document.ts; the
 * sign-in invitations are email-invitations.ts. The rows these documents are
 * made of — the order, the runners, the money — are email-order-rows.ts.
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

/**
 * Sent the moment a registration is created — before any payment is
 * confirmed. Shows the runner exactly what they submitted (so a typo in a
 * name or a wrong category jumps out immediately) and what happens next; it
 * deliberately does not claim the money has been received, only that the
 * registration has.
 */
export async function registrationReceivedEmail(registration: RegistrationWithDetails): Promise<EmailMessage> {
  const { event } = registration;
  const trackUrl = await emailedTrackUrl(registration);
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
      // TRACK_PAGE_PLAN.md D8: where the runner checks whether the payment was
      // validated, instead of messaging staff to ask.
      { kind: 'button', label: 'Track My Registration', href: trackUrl },
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
export async function registrationConfirmationEmail(registration: RegistrationWithDetails): Promise<EmailMessage> {
  const { event, runners } = registration;
  const trackUrl = await emailedTrackUrl(registration);
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
      { kind: 'button', label: 'Track My Registration', href: trackUrl },
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
