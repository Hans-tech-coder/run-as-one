/**
 * **Which channel a payment came in through** (PAYMENT_CHANNELS_PLAN.md D1,
 * D4): each bank-transfer account by name, PayMongo, or *Untagged*. With no
 * Prisma import, so a client screen can ask the same question the server
 * answers, like `payment-correction-rules.ts`.
 *
 * D1 — a bank transfer records the account it was paid into as a **name
 * snapshot**, `paidTo` on Registration, CategoryChange and LogisticsChange.
 * Not a foreign key: `BankAccount` rows are per event, so "GCash" on Event A
 * and on Event B are two rows but one wallet. Rows are grouped by the
 * normalized name (`normalizePaidTo`), and a new value is only ever one of
 * the event's own account names (`asPaidTo`).
 *
 * D4 — the channel is decided by `paymentMethod`, never by the word "GCash":
 *   - `BANK_TRANSFER` → the account in `paidTo`, or *Untagged* when it is null
 *     (every order from before it was asked, D3);
 *   - `COMPLIMENTARY` → no channel (₱0, never listed);
 *   - anything else is online, so **PayMongo** — PayMongo's own `GCASH`
 *     method included, which is PayMongo's money, not the GCash wallet's.
 * A row with no method at all (an upgrade or switch never paid) has no channel.
 */

import { PAYMENT_METHODS, asPaymentMethod } from './registration-codes';

export const PAYMONGO_LABEL = 'PayMongo';
export const UNTAGGED_LABEL = 'Untagged';

/**
 * One channel. `key` is what totals group by; `label` is what a screen prints.
 * An account's key is `account:` + its normalized name, so it can never
 * collide with the two fixed keys whatever the account is called.
 */
export type PaymentChannel =
  | { kind: 'PAYMONGO'; key: 'paymongo'; label: string }
  | { kind: 'UNTAGGED'; key: 'untagged'; label: string }
  | { kind: 'ACCOUNT'; key: `account:${string}`; label: string };

/** A name trimmed and with inner runs of whitespace collapsed to one space. */
function tidy(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * The grouping key of an account name: trimmed, inner spaces collapsed,
 * lowercased. `" GCash "`, `"gcash"` and `"GCASH"` are one wallet. Empty for
 * anything that is not a non-blank string.
 */
export function normalizePaidTo(value: unknown): string {
  return tidy(value).toLowerCase();
}

/**
 * The `paidTo` to store for `value`, or null. Accepted only when it names one
 * of this event's accounts (after normalizing both sides), and then returned
 * in the account's own spelling, so stored names stay consistent whatever the
 * runner or staff sent. Anything else — blank, unknown, another event's
 * account — is refused.
 */
export function asPaidTo(
  value: unknown,
  eventAccounts: readonly { bankName: string }[],
): string | null {
  const key = normalizePaidTo(value);
  if (!key) return null;
  const match = eventAccounts.find((account) => normalizePaidTo(account.bankName) === key);
  return match ? tidy(match.bankName) : null;
}

/** The field error a staff record answers with when no account was chosen. */
export const STAFF_PAID_TO_REQUIRED = 'Choose the account the payment went into.';

/**
 * The `paidTo` a **staff-recorded** bank payment stores (Batch 3: *Record
 * payment*, *Already paid*, and Validate Payment on an upgrade or a switch),
 * or the field error. The same rule as the runner's (`checkoutPaidTo`): one
 * of this event's accounts, required when it has several, that one when it
 * has one. An event that lists no account at all records none (*Untagged*),
 * so a payment staff saw land is never refused for a missing account.
 */
export function staffPaidTo(
  value: unknown,
  eventAccounts: readonly { bankName: string }[],
): { ok: true; value: string | null } | { ok: false; error: string } {
  const named = asPaidTo(value, eventAccounts);
  if (named) return { ok: true, value: named };
  const blank = !normalizePaidTo(value);
  if (blank && eventAccounts.length === 0) return { ok: true, value: null };
  if (blank && eventAccounts.length === 1) return { ok: true, value: tidy(eventAccounts[0].bankName) };
  return { ok: false, error: STAFF_PAID_TO_REQUIRED };
}

/** The channel a paid row's money came in through, or null for none (D4). */
export function channelOf(row: {
  paymentMethod: string | null | undefined;
  paidTo: string | null | undefined;
}): PaymentChannel | null {
  const method = asPaymentMethod(row.paymentMethod);
  if (!method || method === PAYMENT_METHODS.COMPLIMENTARY) return null;
  if (method !== PAYMENT_METHODS.BANK_TRANSFER) {
    return { kind: 'PAYMONGO', key: 'paymongo', label: PAYMONGO_LABEL };
  }
  const key = normalizePaidTo(row.paidTo);
  if (!key) return { kind: 'UNTAGGED', key: 'untagged', label: UNTAGGED_LABEL };
  return { kind: 'ACCOUNT', key: `account:${key}`, label: tidy(row.paidTo) };
}
