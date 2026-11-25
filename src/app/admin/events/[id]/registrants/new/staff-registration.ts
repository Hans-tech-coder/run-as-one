/**
 * The staff registration form's data (STAFF_REGISTRATION_PLAN.md step 4): what
 * a runner and an order hold while staff type, and how they become the
 * multipart form `POST /api/admin/events/[id]/registrations` reads.
 *
 * The form posts exactly what the website's bank-transfer wizard posts, field
 * for field, so `readManualCheckoutForm` reads both the same way; the figures
 * come from the server's own quote, never from arithmetic here.
 */

import { EMPTY_RUNNER_ADDRESS, type RunnerAddress } from '@/lib/runner-address';
import type { AddOnPick } from '@/lib/add-ons';
import { composeDeliveryAddress, EMPTY_DELIVERY_ADDRESS } from '@/app/events/[slug]/register/delivery-address';
import { withResolvedAddresses } from '@/app/events/[slug]/register/RunnerAddressFields';

/** A category as the form offers it. */
export type StaffCategory = { id: string; name: string; price: number; inclusions: string[] };

/** An add-on as the form offers it: on sale now, open to `categoryIds` (empty = all). */
export type StaffAddOn = {
  id: string;
  name: string;
  price: number;
  optionKind: string;
  options: string[];
  maxPerRunner: number;
  categoryIds: string[];
};

/** What the page hands the form: the race and its rules, read on the server. */
export type StaffEvent = {
  id: string;
  title: string;
  /** Race day, YYYY-MM-DD. */
  date: string;
  eventType: string;
  categories: StaffCategory[];
  addOns: StaffAddOn[];
  bankAccounts: string[];
  /** Approved running clubs, sorted: the community field's suggestions. */
  communities: string[];
  pickup: boolean;
  /** Centavos; 0 means that zone is not delivered to. */
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
  province: string | null;
  location: string | null;
  format: string | null;
};

export type StaffRunner = RunnerAddress & {
  key: number;
  categoryId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  birthdate: string;
  singletSize: string;
  runningCommunity: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  medicalConditions: string;
  guardianName: string;
  guardianRelationship: string;
  guardianConsent: boolean;
  /** The earlier runner (0-based) whose home address this one shares; null = typed its own. */
  addressSameAs: number | null;
  /**
   * Runner 2 onwards: use Runner 1's email, or emergency contact, instead of
   * typing one. A group sent over Messenger usually has one inbox and one
   * person to call; on by default, and the copy is made when the order is
   * checked and sent (`resolvedRunners`), so it follows Runner 1's edits.
   */
  emailSameAsFirst: boolean;
  emergencySameAsFirst: boolean;
  addOns: AddOnPick[];
};

let nextKey = 1;

/** A blank runner; runner 1 types an address, the rest start sharing runner 1's. */
export function emptyRunner(index: number, categoryId = ''): StaffRunner {
  return {
    ...EMPTY_RUNNER_ADDRESS,
    key: nextKey++,
    categoryId,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: '',
    birthdate: '',
    singletSize: '',
    runningCommunity: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    medicalConditions: '',
    guardianName: '',
    guardianRelationship: '',
    guardianConsent: false,
    addressSameAs: index === 0 ? null : 0,
    emailSameAsFirst: index > 0,
    emergencySameAsFirst: index > 0,
    addOns: [],
  };
}

/** Each runner as the order will carry it: Runner 1's email and emergency contact copied where asked. */
export function resolvedRunners(runners: StaffRunner[]): StaffRunner[] {
  const [first] = runners;
  return runners.map((runner, index) => ({
    ...runner,
    ...(index > 0 && runner.emailSameAsFirst ? { email: first.email } : {}),
    ...(index > 0 && runner.emergencySameAsFirst
      ? { emergencyContactName: first.emergencyContactName, emergencyContactPhone: first.emergencyContactPhone }
      : {}),
  }));
}

/** Runner `removed` leaves: later runners sharing it, or past it, re-point. */
export function withoutRunner(runners: StaffRunner[], removed: number): StaffRunner[] {
  return runners
    .filter((_, index) => index !== removed)
    .map((runner, index) => {
      const same = runner.addressSameAs;
      if (same === null) return runner;
      if (same === removed) return { ...runner, addressSameAs: index === 0 ? null : 0 };
      return { ...runner, addressSameAs: same > removed ? same - 1 : same };
    });
}

/** The runners as the routes read `participants`: each with its resolved home address. */
export function toParticipants(runners: StaffRunner[]) {
  return withResolvedAddresses(resolvedRunners(runners)).map(
    ({ key: _key, emailSameAsFirst: _email, emergencySameAsFirst: _emergency, ...runner }) => {
      void _key;
      void _email;
      void _emergency;
      return runner;
    },
  );
}

export type Kit = { method: 'PICKUP' | 'DELIVERY'; zone: string; zip: string; landmark: string };

/**
 * The delivery address a group ships to: Runner 1's home, with the ZIP and
 * landmark staff add — the address the wizard starts from (useDeliveryPlan).
 */
export function deliveryAddressFor(kit: Kit, runners: StaffRunner[]): string {
  if (kit.method !== 'DELIVERY' || runners.length === 0) return '';
  const [first] = withResolvedAddresses(runners);
  return composeDeliveryAddress({
    ...EMPTY_DELIVERY_ADDRESS,
    street: first.addressStreet,
    barangay: first.addressBarangay,
    city: first.addressCity,
    province: first.addressProvince,
    zip: kit.zip,
    landmark: kit.landmark,
  });
}

/** What the quote route answers with. */
export type Quote = {
  subtotal: number;
  deliveryFee: number;
  discount?: number;
  platformFee?: number;
  addOnTotal?: number;
  transactionFee?: number;
  total?: number;
  free: boolean;
  promoApplied: string | null;
};

export type OrderDraft = {
  promoCode: string;
  transactionNumber: string;
  paidTo: string;
  proofFile: File | null;
  consent: boolean;
  /** "I checked the money landed": PAID on entry (`registration:validate` only). */
  paymentChecked: boolean;
};

/** The multipart body, field for field as the bank-transfer wizard posts it. */
export function orderFormData(
  event: StaffEvent,
  runners: StaffRunner[],
  kit: Kit,
  order: OrderDraft,
  quote: Quote,
): FormData {
  const first = runners[0];
  const form = new FormData();
  if (order.proofFile) form.append('proofFile', order.proofFile);
  form.append('eventId', event.id);
  form.append('customerEmail', first.email);
  form.append('customerName', `${first.firstName} ${first.lastName}`);
  form.append('logisticsMethod', kit.method);
  form.append('deliveryZone', kit.method === 'DELIVERY' ? kit.zone : '');
  form.append('deliveryAddress', deliveryAddressFor(kit, runners));
  form.append('subtotal', String(quote.subtotal));
  form.append('deliveryFee', String(quote.deliveryFee));
  form.append('platformFee', String(quote.platformFee ?? 0));
  form.append('transactionFee', '0');
  form.append('totalAmount', String(quote.total ?? 0));
  form.append('paymentMethod', 'BANK_TRANSFER');
  form.append('transactionNumber', order.transactionNumber);
  form.append('paidTo', order.paidTo);
  form.append('consentGiven', String(order.consent));
  form.append('paymentChecked', String(order.paymentChecked));
  // The runner's name as staff typed it: the waiver's signature, which the
  // staff member's tick vouches for.
  form.append('consentSignature', `${first.firstName} ${first.lastName}`.trim());
  form.append('promoCode', order.promoCode.trim());
  form.append('priceLock', '');
  form.append('participants', JSON.stringify(toParticipants(runners)));
  return form;
}
