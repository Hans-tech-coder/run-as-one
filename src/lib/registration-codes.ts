/**
 * The three coded columns on a Registration — how they are stored, and how a
 * person reads them.
 *
 * `paymentMethod`, `logisticsMethod` and `deliveryZone` used to be stored in
 * PayMongo's own casing (`bank_transfer`, `delivery`, `inside`), which made
 * them the only lowercase string columns in the schema: `status` is `PAID`,
 * `role` is `SUPER_ADMIN`, `eventType` is `FUN_RUN`, `registrationForm` is
 * `BANK_TRANSFER`. They are now uppercase too, so every coded column in the
 * database has one shape, and an export never mixes `DELA CRUZ` with
 * `bank_transfer` on the same row.
 *
 * **The guards accept either casing.** Rows written before this change still
 * hold `delivery` and `inside`, and a registration must keep displaying and
 * pricing correctly forever — normalizing on read costs nothing and removes any
 * need to migrate old data before the app can be trusted.
 *
 * **PayMongo still gets lowercase.** Their API only accepts `gcash`, `card`,
 * `paymaya`; `paymongoPaymentType()` is the single place that converts, called
 * at the API boundary in `api/checkout`. Nothing else in the app should ever
 * lowercase a payment method.
 *
 * The labels here are title case, because they are read by a runner choosing a
 * delivery area or reading a receipt. The admin's registrants screen uppercases
 * them on the way in (`registrants/page.tsx`), since there they are stored data
 * sitting beside a runner's uppercase name, not a choice being offered.
 */

export const LOGISTICS_METHODS = {
  PICKUP: 'PICKUP',
  DELIVERY: 'DELIVERY',
} as const;

export type LogisticsMethod =
  (typeof LOGISTICS_METHODS)[keyof typeof LOGISTICS_METHODS];

export const DELIVERY_ZONES = {
  INSIDE: 'INSIDE',
  OUTSIDE: 'OUTSIDE',
} as const;

export type DeliveryZone = (typeof DELIVERY_ZONES)[keyof typeof DELIVERY_ZONES];

/** Uppercased and trimmed, which is all "stored form" means for these columns. */
function asCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/**
 * Narrows an untrusted value to a logistics method. Anything unrecognised is
 * PICKUP — the option every event offers and the one that charges nothing, so
 * a junk value can never invent a delivery fee.
 */
export function asLogisticsMethod(value: unknown): LogisticsMethod {
  return asCode(value) === LOGISTICS_METHODS.DELIVERY
    ? LOGISTICS_METHODS.DELIVERY
    : LOGISTICS_METHODS.PICKUP;
}

/**
 * Narrows an untrusted value to a zone. Anything else is null, which
 * deliveryFeeFor() prices at 0 — so a junk zone can never bill anyone.
 */
export function asDeliveryZone(value: unknown): DeliveryZone | null {
  const code = asCode(value);
  return code === DELIVERY_ZONES.INSIDE || code === DELIVERY_ZONES.OUTSIDE
    ? code
    : null;
}

/** The stored form of a payment method, whatever the client called it. */
export function asPaymentMethod(value: unknown): string {
  return asCode(value);
}

export const PAYMENT_METHODS = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  GCASH: 'GCASH',
  CARD: 'CARD',
} as const;

/**
 * What a person should read instead of the stored code.
 *
 * A method PayMongo adds later is not in this table, and still has to render as
 * something: the fallback turns `GRAB_PAY` into `Grab Pay` rather than showing
 * a raw code to a runner.
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CARD: 'Credit / Debit Card',
  GCASH: 'GCash',
  MAYA: 'Maya',
  PAYMAYA: 'Maya',
  QRPH: 'QR Ph',
  GRAB_PAY: 'GrabPay',
  BANK_TRANSFER: 'Bank Transfer',
};

export function paymentMethodLabel(value: unknown): string {
  const code = asCode(value);
  if (!code) return '';
  return (
    PAYMENT_METHOD_LABELS[code] ??
    code
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ')
  );
}

export function logisticsMethodLabel(value: unknown): string {
  return asLogisticsMethod(value) === LOGISTICS_METHODS.DELIVERY
    ? 'Delivery'
    : 'Pickup';
}

const DELIVERY_ZONE_LABELS: Record<DeliveryZone, string> = {
  INSIDE: 'Inside Province',
  OUTSIDE: 'Outside Province',
};

/** Empty for a registration that was picked up, which has no zone at all. */
export function deliveryZoneLabel(value: unknown): string {
  const zone = asDeliveryZone(value);
  return zone ? DELIVERY_ZONE_LABELS[zone] : '';
}

/**
 * The only place a payment method is lowercased.
 *
 * PayMongo's `payment_method_types`, `payment_method_allowed` and payment
 * method `type` all reject anything but their own lowercase spelling, so the
 * stored code is converted here at the boundary and nowhere else.
 */
export function paymongoPaymentType(value: unknown): string {
  return asCode(value).toLowerCase();
}

/** Whether a registration was paid by bank transfer — the one method an admin verifies by hand. */
export function isBankTransfer(value: unknown): boolean {
  return asCode(value) === PAYMENT_METHODS.BANK_TRANSFER;
}
