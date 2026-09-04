/**
 * The accounts a runner can transfer to for one event.
 *
 * These used to be a constant in the bundle, which meant every event pointed
 * runners at the same three banks no matter whose event it was — the money went
 * to the wrong place. They are per event now, set by the organizer.
 */

/** One account as it travels between the admin form, the API, and the wizard. */
export interface BankAccountInput {
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** Null rather than empty string when there is no QR, matching the column. */
  qrImageUrl: string | null;
}

/** One account as a runner sees it. */
export interface BankAccountView extends BankAccountInput {
  id: string;
}

const MAX_FIELD_LENGTH = 120;

function text(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

/**
 * Whatever the request body carried, as accounts worth storing.
 *
 * A row missing any of the three text fields is dropped rather than stored: an
 * account with no number cannot be paid, and one with no account name fails at
 * the counter, so a half-filled row would only mislead a runner into a transfer
 * that bounces. The QR is genuinely optional — plenty of accounts have none.
 */
export function asBankAccounts(value: unknown): BankAccountInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(row => ({
      bankName: text((row as any)?.bankName),
      accountName: text((row as any)?.accountName),
      accountNumber: text((row as any)?.accountNumber),
      qrImageUrl: text((row as any)?.qrImageUrl) || null,
    }))
    .filter(row => row.bankName && row.accountName && row.accountNumber);
}

/**
 * Whether this event can actually take a bank transfer right now.
 *
 * Having the option turned on is not enough — without an account to send money
 * to, offering it would strand the runner at the last step. The wizards use
 * this to hide the option rather than let it fail.
 */
export function hasBankAccounts(
  event: { bankAccounts?: readonly unknown[] | null } | null | undefined
): boolean {
  return (event?.bankAccounts?.length ?? 0) > 0;
}
