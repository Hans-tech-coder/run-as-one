/**
 * **Which orders a payment correction may touch, and how long its reason may
 * be** (PAYMENT_CORRECTION_PLAN.md C1, C2, C4), with no Prisma import, so the
 * registrants screen's client code can ask the same question the server
 * answers. `lib/payment-correction.ts` re-exports these and owns the rest of
 * the rule (the lock, the write, the trail line).
 */

import { PAYMENT_METHODS, asPaymentMethod } from './registration-codes';

/** The methods a manual order may hold. The manual checkout writes only this one. */
export const MANUAL_PAYMENT_METHODS = [PAYMENT_METHODS.BANK_TRANSFER] as const;

/** The statuses a correction may land on (C2). */
export const CORRECTABLE_STATUSES = ['PENDING', 'PAID'] as const;

/** One trail line's worth of "why". */
export const CORRECTION_REASON_MAX = 200;

export function isManualPaymentMethod(value: unknown): boolean {
  return (MANUAL_PAYMENT_METHODS as readonly string[]).includes(asPaymentMethod(value));
}

export function isCorrectableStatus(status: unknown): boolean {
  return typeof status === 'string' && (CORRECTABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * C2a: whether a correction needs a fresh step-up. Only a PAID order's money
 * evidence is guarded: its Transaction No., its proof and its method.
 * Re-tagging *Paid to* alone, which only moves the payment between the race's
 * own accounts in the channel breakdown, takes the reason and nothing more
 * (owner, 2026-11-21). The screen asks this to decide whether to open the
 * dialog; the route asks it to decide whether to demand the token.
 */
export function correctionNeedsStepUp(
  status: unknown,
  changes: { transactionNumber?: string | null; proof?: boolean; paymentMethod?: string | null },
): boolean {
  if (status !== 'PAID') return false;
  return Boolean(changes.proof || changes.transactionNumber?.trim() || changes.paymentMethod?.trim());
}
