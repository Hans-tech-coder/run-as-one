/**
 * **How an upgrade is paid, and how long it waits for the money**
 * (CATEGORY_CHANGE_PLAN.md D11, D13; Session 3).
 *
 * An upgrade — a change with something to pay — is written AWAITING_PAYMENT
 * and holds a seat in the category the runner is moving to (`slot-holds.ts`).
 * Staff pick one of three ways the money comes in when they open it, and the
 * way decides both the transaction fee and the hold:
 *
 * - **Online** — the runner gets a payment link and pays through PayMongo, by
 *   the method the app offers today (`OFFERED_PAYMONGO_METHODS`, QR Ph).
 *   PayMongo's cut is the runner's, on top (D13). Held for
 *   `PENDING_EXPIRY_HOURS`, the window an unpaid online checkout gets.
 * - **Will pay outside the app** — GCash or a bank transfer the runner sends
 *   to Run As One's own account, recorded by staff once it lands. No fee.
 *   Held for `BANK_TRANSFER_EXPIRY_DAYS`, the window a bank transfer gets for
 *   staff to check it.
 * - **Already paid outside the app** — the same, recorded at once, so the
 *   change applies in the same step. This is the case that started Session 3:
 *   a runner who already sent the difference by GCash is moved on what they
 *   paid, without the basis being bent to make the amount come out at zero.
 *
 * GCash sent to the organizer's own number is a bank transfer here, as it is
 * on the registration form: Run As One's accounts list GCash beside the banks
 * (`BankAccount.bankName`), and `paymentMethod` keeps `GCASH` for PayMongo's.
 *
 * **Only the way the runner paid for the entry is offered**
 * (`paymentChoicesForOrder`). A runner who paid online pays the difference
 * online, so PayMongo's webhook applies it and its reference is the record —
 * nothing for staff to check by hand. A runner who paid by bank transfer sends
 * the difference the same way. A free order paid nothing and so names no way;
 * every choice stays open. When online payment is off, an online payer falls
 * back to GCash or bank so the change can still be made. The route refuses any
 * other choice, so the rule holds outside the modal too.
 *
 * Every hold stops at the event's change deadline (D12): there is no seat
 * worth holding past the moment the change could no longer be made.
 *
 * Kept free of Prisma, like `category-change.ts`, so the modal states the same
 * hold and fee the route writes.
 */

import { OFFERED_PAYMONGO_METHODS } from './free-checkout';
import { PAYMENT_METHODS } from './registration-codes';

/** Hours an upgrade paid online is held: an unpaid online checkout's window (pending-expiry.ts). */
export const ONLINE_CHANGE_HOLD_HOURS = 24;

/** Days an upgrade paid outside the app is held: a bank transfer's window (pending-expiry.ts). */
export const OUTSIDE_CHANGE_HOLD_DAYS = 7;

export const CHANGE_PAYMENT_CHOICES = {
  ONLINE: 'ONLINE',
  OUTSIDE_LATER: 'OUTSIDE_LATER',
  OUTSIDE_PAID: 'OUTSIDE_PAID',
} as const;

export type ChangePaymentChoice = (typeof CHANGE_PAYMENT_CHOICES)[keyof typeof CHANGE_PAYMENT_CHOICES];

export function asChangePaymentChoice(value: unknown): ChangePaymentChoice | null {
  return typeof value === 'string' && (Object.values(CHANGE_PAYMENT_CHOICES) as string[]).includes(value)
    ? (value as ChangePaymentChoice)
    : null;
}

/** The PayMongo method a change is paid online with, or null when none is offered. */
export function onlineChangeMethod(): string | null {
  return OFFERED_PAYMONGO_METHODS[0] ?? null;
}

/** The stored `paymentMethod` for a choice: the PayMongo method, or a bank transfer. */
export function paymentMethodForChoice(choice: ChangePaymentChoice): string | null {
  return choice === CHANGE_PAYMENT_CHOICES.ONLINE ? onlineChangeMethod() : PAYMENT_METHODS.BANK_TRANSFER;
}

const OUTSIDE_CHOICES: ChangePaymentChoice[] = [CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER, CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID];

/**
 * The choices an upgrade may be paid by, from the order's own `paymentMethod`:
 * bank transfer → GCash or bank only; free → all; anything paid through
 * PayMongo (including the old `online` default) → the payment link, or GCash
 * or bank while online payment is off.
 */
export function paymentChoicesForOrder(orderPaymentMethod: string | null | undefined): ChangePaymentChoice[] {
  const method = (orderPaymentMethod ?? '').toUpperCase();
  if (method === PAYMENT_METHODS.BANK_TRANSFER) return OUTSIDE_CHOICES;
  const online: ChangePaymentChoice[] = onlineChangeMethod() ? [CHANGE_PAYMENT_CHOICES.ONLINE] : [];
  if (method === PAYMENT_METHODS.COMPLIMENTARY) return [...online, ...OUTSIDE_CHOICES];
  return online.length ? online : OUTSIDE_CHOICES;
}

/**
 * The choices a **delivery switch's** fee may be paid by
 * (LOGISTICS_CHANGE_PLAN.md, the owner's addition to Session 4). A payment link
 * or GCash or bank to come follow the way the entry was paid, as above.
 * *Already paid* is offered on every receipt to staff who may record a payment
 * (`registration:validate`), and to no one else: the money is already in, by
 * GCash or bank, whatever the entry was paid with, so the only question left
 * is whether it is real, which the reference and the proof answer, as on
 * *Record payment*.
 */
export function switchPaymentChoices(
  orderPaymentMethod: string | null | undefined,
  recordPaid: boolean,
): ChangePaymentChoice[] {
  const choices = paymentChoicesForOrder(orderPaymentMethod).filter(
    choice => choice !== CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID,
  );
  return recordPaid ? [...choices, CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID] : choices;
}

/** Whether a stored method is one staff record by hand (no PayMongo, no fee). */
export function isOutsidePayment(paymentMethod: string | null | undefined): boolean {
  return paymentMethod === PAYMENT_METHODS.BANK_TRANSFER;
}

/**
 * Until when an awaiting upgrade holds its seat: its method's window from
 * `now`, never past the change deadline. Null deadline means none was set and
 * the event has no date to fall back on, which `categoryChangeDeadline` never
 * answers for a real event; the window alone then applies.
 */
export function changeHoldUntil(paymentMethod: string | null, now: Date, deadline: Date | null): Date {
  const window = isOutsidePayment(paymentMethod)
    ? OUTSIDE_CHANGE_HOLD_DAYS * 24 * 60 * 60 * 1000
    : ONLINE_CHANGE_HOLD_HOURS * 60 * 60 * 1000;
  const until = now.getTime() + window;
  return new Date(deadline ? Math.min(until, deadline.getTime()) : until);
}

/** Whether a change's hold has run out, by its time alone (the sweep marks it later). */
export function holdLapsed(holdUntil: Date | string | null, now: Date = new Date()): boolean {
  return holdUntil !== null && new Date(holdUntil).getTime() <= now.getTime();
}

/** Whether a change can still be paid through its link, and if not, why. */
export type ChangePayableState = 'payable' | 'applied' | 'cancelled' | 'expired';

/**
 * The one rule the staff side (copying a link) and the public side (opening and
 * paying it) apply to a change, as `payableState` is for an order.
 *
 * - **applied** — APPLIED, REFUND_DUE or REFUNDED: the runner already moved.
 * - **cancelled** — staff withdrew it.
 * - **expired** — EXPIRED, or still awaiting with its hold or the deadline
 *   past: the held seat is gone or going, and the runner asks staff again.
 */
export function changePayableState(
  change: { status: string; holdUntil: Date | string | null },
  deadline: Date | null,
  now: Date = new Date(),
): ChangePayableState {
  if (change.status === 'CANCELLED') return 'cancelled';
  if (change.status === 'EXPIRED') return 'expired';
  if (change.status !== 'AWAITING_PAYMENT') return 'applied';
  if (holdLapsed(change.holdUntil, now)) return 'expired';
  // An unreadable race day gives no deadline, which every caller of
  // `categoryChangeDeadline` reads as closed.
  if (!deadline || deadline.getTime() <= now.getTime()) return 'expired';
  return 'payable';
}

/** The longest transaction number kept: a GCash or bank reference, never a paragraph. */
export const MAX_TRANSACTION_NUMBER = 100;

/** A posted transaction number, trimmed, or the sentence saying what is wrong. */
export function readTransactionNumber(raw: unknown): { value: string | null; error: string | null } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { value: null, error: 'Enter the GCash or bank reference number of the payment' };
  if (value.length > MAX_TRANSACTION_NUMBER) {
    return { value: null, error: `Keep the reference number to ${MAX_TRANSACTION_NUMBER} characters` };
  }
  return { value, error: null };
}
