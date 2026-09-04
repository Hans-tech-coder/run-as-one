/**
 * One row of the bank accounts editor, in the shape the admin forms work in.
 *
 * `id` is absent for a row the organizer just added and present for one loaded
 * from the database. Unlike categories, nothing else in the schema points at a
 * bank account, so the update route is free to replace the whole set rather
 * than reconcile row by row — the id is carried only so a reload shows the same
 * rows in the same order.
 */
export interface BankAccountDraft {
  id?: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** Blob URL of the QR image, or empty when the account has no QR. */
  qrImageUrl?: string;
}

export function blankBankAccount(): BankAccountDraft {
  return { bankName: '', accountName: '', accountNumber: '', qrImageUrl: '' };
}

/**
 * Whether a row carries enough to be worth storing.
 *
 * All three text fields, because an account is useless to a runner without any
 * one of them — a bank with no number cannot be paid, and a number with no name
 * fails the transfer at the counter. Half-filled rows are dropped rather than
 * saved, so an organizer who starts a row and changes their mind is not stuck.
 */
export function isUsableBankAccount(row: BankAccountDraft): boolean {
  return Boolean(
    row.bankName.trim() && row.accountName.trim() && row.accountNumber.trim()
  );
}

/** The rows worth saving, trimmed, in the order the organizer arranged them. */
export function cleanBankAccounts(rows: readonly BankAccountDraft[]): BankAccountDraft[] {
  return rows.filter(isUsableBankAccount).map(row => ({
    id: row.id,
    bankName: row.bankName.trim(),
    accountName: row.accountName.trim(),
    accountNumber: row.accountNumber.trim(),
    qrImageUrl: row.qrImageUrl?.trim() || '',
  }));
}
