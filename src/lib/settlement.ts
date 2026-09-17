/**
 * What Run As One owes the organizer of a race, and what it has paid
 * (ADMIN_MERGE_PLAN.md, Batch 6).
 *
 * Runners pay Run As One — through PayMongo or a bank transfer — and Run As One
 * settles with the organizer afterwards. The owner's answers, as rules:
 *
 * - **Run As One keeps the platform fee and the transaction fee** of every
 *   order. The platform fee is `Event.adminFee` per runner; the transaction fee
 *   is what the wizard added on top to cover PayMongo, so PayMongo's cut is the
 *   runner's and never comes out of the organizer's share.
 * - **The organizer is owed the rest**: the race entries after any discount,
 *   plus the delivery fee. A promotion is the organizer's own money given away,
 *   the same reading the Overview's *Total Revenue (Net)* tile makes.
 * - **Only `PAID` orders count.** A PENDING bank transfer is not money yet, and
 *   an order refunded after a payout simply stops counting — what is owed drops,
 *   and the balance goes negative (*Overpaid*) until the next payout absorbs it
 *   or the organizer's return is recorded. Nothing already recorded is edited.
 * - **Per event**, because bank accounts are per event.
 *
 * Owed is computed as the order's total less Run As One's two fees, rather than
 * re-added from its parts. Checkout pins `total = subtotal + delivery + platform
 * + transaction − discount`, so the two are the same number — but reading it
 * this way means *collected = share + owed* holds on every row by construction,
 * and the screen's three figures can never fail to add up.
 *
 * Integer centavos throughout (`money.ts`). Prisma-free, so the record dialog
 * can run the same field checks the route runs; the queries live in
 * `settlement-store.ts`.
 */

import { isCalendarDay, today } from './event-schedule';
import { formatPesos } from './money';

// ── The arithmetic ──────────────────────────────────────────────────────────

export type SettlementState = 'NOTHING' | 'DUE' | 'SETTLED' | 'OVERPAID';

export type Settlement = {
  /** How many PAID orders the figures are made of. */
  paidOrders: number;
  /** Everything runners paid on those orders. */
  collected: number;
  platformFees: number;
  transactionFees: number;
  /** Run As One's share: the two fees. */
  share: number;
  /** The organizer's share: collected less Run As One's. */
  owed: number;
  /** Payouts less returns, voided rows left out. */
  remitted: number;
  /** Owed less remitted. Negative means the organizer has been overpaid. */
  balance: number;
  state: SettlementState;
};

/** Order totals already summed by the database (one grouped query per screen). */
export type OrderTotals = {
  paidOrders: number;
  collected: number;
  platformFees: number;
  transactionFees: number;
};

export const NO_ORDERS: OrderTotals = { paidOrders: 0, collected: 0, platformFees: 0, transactionFees: 0 };

export function settle(orders: OrderTotals, remitted: number): Settlement {
  const share = orders.platformFees + orders.transactionFees;
  const owed = orders.collected - share;
  const balance = owed - remitted;
  const state: SettlementState =
    balance > 0
      ? 'DUE'
      : balance < 0
        ? 'OVERPAID'
        : orders.paidOrders === 0 && remitted === 0
          ? 'NOTHING'
          : 'SETTLED';
  return { ...orders, share, owed, remitted, balance, state };
}

/**
 * How each state is put to staff. Worded as well as coloured, because amber
 * and red alone would ask a person to remember which one means money is still
 * to go out. `badge` is the `.status-badge` tone in Admin.css.
 */
export const SETTLEMENT_STATE_COPY: Record<
  SettlementState,
  { label: string; badge: 'neutral' | 'success' | 'danger' | 'pending'; hint: string }
> = {
  NOTHING: { label: 'No Orders', badge: 'neutral', hint: 'No paid orders yet, and nothing remitted.' },
  DUE: { label: 'Balance Due', badge: 'pending', hint: 'Run As One still owes the organizer.' },
  SETTLED: { label: 'Settled', badge: 'success', hint: 'Everything owed has been remitted.' },
  OVERPAID: {
    label: 'Overpaid',
    badge: 'danger',
    hint: 'More was remitted than is owed — usually a refund after a payout.',
  },
};

/** "₱1,234.50", or "−₱1,234.50" with a real minus sign where the sign matters. */
export function formatSignedPesos(value: number): string {
  // `|| 0` folds −0 (a negated zero, "less ₱0.00 remitted") into 0, which
  // toLocaleString would otherwise print as "-0.00".
  const centavos = value || 0;
  return centavos < 0 ? `−₱${formatPesos(-centavos)}` : `₱${formatPesos(centavos)}`;
}

// ── The vocabulary of a remittance ──────────────────────────────────────────

export const REMITTANCE_KINDS = ['PAYOUT', 'RETURN'] as const;
export type RemittanceKind = (typeof REMITTANCE_KINDS)[number];

export const REMITTANCE_KIND_COPY: Record<RemittanceKind, { label: string; hint: string }> = {
  PAYOUT: { label: 'Payout', hint: 'Run As One paid the organizer.' },
  RETURN: { label: 'Return', hint: 'The organizer paid money back to Run As One.' },
};

export const REMITTANCE_METHODS = ['BANK_TRANSFER', 'GCASH', 'MAYA', 'CASH', 'CHECK', 'OTHER'] as const;
export type RemittanceMethod = (typeof REMITTANCE_METHODS)[number];

export const REMITTANCE_METHOD_LABELS: Record<RemittanceMethod, string> = {
  BANK_TRANSFER: 'Bank Transfer',
  GCASH: 'GCash',
  MAYA: 'Maya',
  CASH: 'Cash',
  CHECK: 'Check',
  OTHER: 'Other',
};

function pick<T extends string>(list: readonly T[], value: unknown): T | null {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (list as readonly string[]).includes(upper) ? (upper as T) : null;
}

export const asRemittanceKind = (value: unknown) => pick(REMITTANCE_KINDS, value);
export const asRemittanceMethod = (value: unknown) => pick(REMITTANCE_METHODS, value);

/** A label for a stored code, tolerating one written by a newer deploy. */
export function remittanceMethodLabel(value: string): string {
  const method = asRemittanceMethod(value);
  return method ? REMITTANCE_METHOD_LABELS[method] : value;
}

export function remittanceKindLabel(value: string): string {
  const kind = asRemittanceKind(value);
  return kind ? REMITTANCE_KIND_COPY[kind].label : value;
}

// ── Reading the form ────────────────────────────────────────────────────────

/**
 * The largest single remittance accepted, ₱10,000,000. Well under what the
 * Int column holds, and far above any race's collections — a figure past it is
 * a typo (an extra zero or two), not a payout.
 */
export const MAX_REMITTANCE = 1_000_000_000;
export const MAX_REFERENCE = 100;
export const MAX_REMITTANCE_NOTE = 500;
export const MAX_VOID_REASON = 300;

/** "12,500", "12500.5", "12,500.50" — pesos with at most two decimals. */
const PESOS = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

/** Pesos as typed → centavos, or null when it is not a plain peso amount. */
export function parsePesos(value: unknown): number | null {
  const text = typeof value === 'string' ? value.trim().replace(/^₱\s*/, '') : '';
  if (!PESOS.test(text)) return null;
  const [whole, fraction = ''] = text.replace(/,/g, '').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export type RemittanceFieldErrors = Partial<
  Record<'kind' | 'amount' | 'paidOn' | 'method' | 'reference' | 'note' | 'reason', string>
>;

export type RemittanceInput = {
  kind: RemittanceKind;
  amount: number;
  paidOn: string;
  method: RemittanceMethod;
  reference: string | null;
  note: string | null;
};

type RawRemittance = {
  kind?: unknown;
  amount?: unknown;
  paidOn?: unknown;
  method?: unknown;
  reference?: unknown;
  note?: unknown;
};

function optionalText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text : null;
}

/**
 * The record form's fields, checked the same way in the dialog and in the
 * route. Each refusal is named under its own field.
 */
export function readRemittance(
  raw: RawRemittance,
  now: Date = new Date(),
): { value: RemittanceInput | null; errors: RemittanceFieldErrors } {
  const errors: RemittanceFieldErrors = {};

  const kind = asRemittanceKind(raw.kind);
  if (!kind) errors.kind = 'Choose whether this is a payout or a return.';

  const amountText = typeof raw.amount === 'string' ? raw.amount.trim() : '';
  const amount = parsePesos(raw.amount);
  if (!amountText) errors.amount = 'Enter the amount that was sent.';
  else if (amount === null) errors.amount = 'Enter the amount in pesos, like 12,500 or 12,500.50.';
  else if (amount <= 0) errors.amount = 'The amount must be more than ₱0.00.';
  else if (amount > MAX_REMITTANCE) errors.amount = `The amount cannot be more than ₱${formatPesos(MAX_REMITTANCE)}.`;

  const paidOn = typeof raw.paidOn === 'string' ? raw.paidOn.trim() : '';
  if (!paidOn) errors.paidOn = 'Enter the day the money was sent.';
  else if (!isCalendarDay(paidOn) || Number.isNaN(Date.parse(`${paidOn}T00:00:00+08:00`)))
    errors.paidOn = 'Enter the day as a date, like 2026-09-17.';
  else if (paidOn > today(now)) errors.paidOn = 'The day the money was sent cannot be in the future.';

  const method = asRemittanceMethod(raw.method);
  if (!method) errors.method = 'Choose how the money was sent.';

  const reference = optionalText(raw.reference);
  if (reference && reference.length > MAX_REFERENCE)
    errors.reference = `Keep the reference number to ${MAX_REFERENCE} characters.`;

  const note = optionalText(raw.note);
  if (note && note.length > MAX_REMITTANCE_NOTE)
    errors.note = `Keep the note to ${MAX_REMITTANCE_NOTE} characters.`;

  if (Object.keys(errors).length > 0 || !kind || amount === null || !method) {
    return { value: null, errors };
  }
  return { value: { kind, amount, paidOn, method, reference, note }, errors };
}

/** Why a remittance is being voided — required, since a void without one explains nothing later. */
export function readVoidReason(raw: unknown): { reason: string | null; errors: RemittanceFieldErrors } {
  const reason = optionalText(raw);
  if (!reason) return { reason: null, errors: { reason: 'Say why this remittance is being voided.' } };
  if (reason.length > MAX_VOID_REASON)
    return { reason: null, errors: { reason: `Keep the reason to ${MAX_VOID_REASON} characters.` } };
  return { reason, errors: {} };
}

/** What the audit summary and the toast call a remittance: "₱12,500.00 payout by GCash". */
export function describeRemittance(row: { kind: string; amount: number; method: string }): string {
  return `₱${formatPesos(row.amount)} ${remittanceKindLabel(row.kind).toLowerCase()} by ${remittanceMethodLabel(row.method)}`;
}
