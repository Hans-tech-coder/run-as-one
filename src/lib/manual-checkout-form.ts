/**
 * Reading and checking the bank-transfer checkout form (`POST
 * /api/checkout/manual`), before anything touches the database.
 *
 * **The rule this module owns:** a manual order is refused before the event
 * is even read unless it carries the waiver tick and a typed signature, has a
 * size `participantCountError` allows, valid email addresses on every runner
 * and on the order, and no birthdate from the future. The wizard checks all of
 * these as the runner types, but this route is public and a tab left open can
 * post straight here, so the server is the last word. The event-dependent
 * checks (options, guardians, addresses, the race's open/closed state) stay in
 * the route, since they need the event row.
 *
 * Split out of the route unchanged (PAYMENT_REFERENCE_UNIQUE_PLAN.md Batch 1).
 */

import { participantCountError } from './order-size';
import { participantBirthdateError } from './minor-consent';
import { upperCaseForStorage } from './text-case';
import { consentSignatureError } from './consent-signature';
import { emailAddressError, normalizeEmailAddress, participantEmailError } from './email-address';

/** What the route reads off the form, after the checks above passed. */
export type ManualCheckoutForm = {
  proofFile: File | null;
  eventId: string;
  customerEmail: string;
  customerName: string;
  logisticsMethod: string;
  deliveryZone: string;
  deliveryAddress: string;
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  transactionFee: number;
  totalAmount: number;
  /** Raw from the form; the route reads it through `readTransactionNumber`. */
  transactionNumber: string;
  promoCode: string;
  /** A string, or null when the wizard sent none; readPriceLock takes either. */
  priceLock: FormDataEntryValue | null;
  // Untyped JSON off the form, as the route always read it; each check above
  // and the route's own read the fields they need.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  participants: any[];
  /** Uppercased and checked. */
  storedConsentSignature: string;
  /** Trimmed, never cased. */
  storedCustomerEmail: string;
};

export type ManualCheckoutRead =
  | { form: ManualCheckoutForm; refusal?: undefined }
  | { form?: undefined; refusal: { error: string; status: number } };

const refuse = (error: string, status = 400): ManualCheckoutRead => ({ refusal: { error, status } });

/**
 * Read the form and run the checks that need no event. A malformed
 * `participants` JSON throws, as it always did (the route answers 500).
 */
export function readManualCheckoutForm(formData: FormData): ManualCheckoutRead {
  const proofFile = formData.get('proofFile') as File | null;
  const eventId = formData.get('eventId') as string;
  const customerEmail = formData.get('customerEmail') as string;
  const customerName = formData.get('customerName') as string;
  const logisticsMethod = formData.get('logisticsMethod') as string;
  const deliveryZone = formData.get('deliveryZone') as string;
  const deliveryAddress = formData.get('deliveryAddress') as string;
  // Amounts arrive as centavos. Round defensively — Prisma rejects a
  // non-integer for an Int column, and a stray decimal here would 500.
  const centavos = (field: string) => Math.round(Number(formData.get(field)) || 0);

  const subtotal = centavos('subtotal');
  const deliveryFee = centavos('deliveryFee');
  const platformFee = centavos('platformFee');
  const transactionFee = centavos('transactionFee');
  const totalAmount = centavos('totalAmount');
  const transactionNumber = formData.get('transactionNumber') as string;
  const consentGiven = formData.get('consentGiven') === 'true';
  const consentSignature = formData.get('consentSignature') as string;
  const promoCode = formData.get('promoCode') as string;
  const priceLock = formData.get('priceLock');

  const participantsStr = formData.get('participants') as string;
  const participants = JSON.parse(participantsStr || '[]');

  // The proof is required a little further down, in the route: an order that
  // costs nothing has no deposit slip to show, and whether it costs nothing is
  // only knowable once the event and the promo code have been read. See
  // lib/free-checkout.ts.

  // The wizard already disables its submit button without this, but the
  // waiver is a legal gate, not a data-completeness one — an unauthorized
  // request that skips the UI must not be able to skip it either.
  if (!consentGiven) {
    return refuse('Please agree to the Disclaimer, Consent & Data Privacy Waiver to continue.');
  }

  // The signature is the other half of that gate, and it is checked here for
  // the same reason: a tick can be posted by anything, while a name someone
  // typed is a person putting themselves on the record. Only its presence is
  // required — see lib/consent-signature.ts, which both wizards share.
  // Uppercased first so the check runs on the value that will be stored.
  const storedConsentSignature = upperCaseForStorage(consentSignature);
  const signatureProblem = consentSignatureError(storedConsentSignature);
  if (signatureProblem) return refuse(signatureProblem);

  // One order reserves one slot per runner and an unpaid one holds them for
  // a day, so its size is capped here as well as in the wizard: otherwise a
  // single POST could hold a whole category. See lib/order-size.ts.
  const sizeProblem = participantCountError(participants);
  if (sizeProblem) return refuse(sizeProblem);

  // Every email this order will ever produce goes to the address below: the
  // "registration received" mail, the receipt when the payment clears, and
  // anything an organizer sends by hand later. An address Resend refuses
  // ("Invalid `to` field") makes all of that silent — and by then the runner
  // has paid, so there is no screen left to tell them on. The wizards check
  // the same rule as the runner types (see lib/email-address.ts), and this is
  // the door that does not depend on the wizard having been the thing that
  // posted.
  const emailProblem =
    participantEmailError(participants) ??
    emailAddressError(customerEmail, { blank: 'Enter an email address for this order' });
  if (emailProblem) return refuse(emailProblem);

  // A birthdate from the future is refused here as well as in the wizard, so
  // a direct POST cannot store one. See lib/minor-consent.ts.
  const birthdateProblem = participantBirthdateError(participants);
  if (birthdateProblem) return refuse(birthdateProblem);

  return {
    form: {
      proofFile,
      eventId,
      customerEmail,
      customerName,
      logisticsMethod,
      deliveryZone,
      deliveryAddress,
      subtotal,
      deliveryFee,
      platformFee,
      transactionFee,
      totalAmount,
      transactionNumber,
      promoCode,
      priceLock,
      participants,
      storedConsentSignature,
      // Trimmed, never cased: a space pasted in from a contact card is enough
      // to stop the send on its own, while the local part of an address is
      // case-sensitive on some mail servers.
      storedCustomerEmail: normalizeEmailAddress(customerEmail),
    },
  };
}
