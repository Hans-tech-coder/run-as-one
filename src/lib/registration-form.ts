/**
 * Which checkout an event shows its runners.
 *
 * Stored as a plain string column rather than a Postgres enum, matching how
 * `status` and `paymentMethod` are already stored. That means the API is the
 * only thing standing between a typo'd payload and an event whose registration
 * page renders neither wizard — hence asRegistrationForm() below.
 */

export const REGISTRATION_FORMS = {
  /** PayMongo (GCash, Maya, QRPh, card) plus bank transfer. */
  ONLINE: 'ONLINE',
  /** Bank transfer only. No PayMongo, no other option. */
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;

export type RegistrationForm =
  (typeof REGISTRATION_FORMS)[keyof typeof REGISTRATION_FORMS];

export const DEFAULT_REGISTRATION_FORM: RegistrationForm = REGISTRATION_FORMS.ONLINE;

/**
 * Anything unrecognised falls back to ONLINE — the behaviour every event had
 * before this setting existed. An event that silently offers too many payment
 * options is recoverable; one that offers none is a dead registration page.
 */
export function asRegistrationForm(value: unknown): RegistrationForm {
  return value === REGISTRATION_FORMS.BANK_TRANSFER
    ? REGISTRATION_FORMS.BANK_TRANSFER
    : DEFAULT_REGISTRATION_FORM;
}
