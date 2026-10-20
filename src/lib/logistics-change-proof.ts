import { isOutsidePayment } from '@/lib/category-change-hold';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';

/**
 * **When a GCash or bank delivery switch counts as "proof submitted", and what
 * that does to its clock** (LOGISTICS_CHANGE_PLAN.md Revision 3, T5 and T6).
 *
 * The runner uploads the screenshot and the reference on the switch's link
 * (`logistics-change-runner.ts`), onto the switch's own `proofOfPayment` and
 * `transactionNumber`. A switch still AWAITING_PAYMENT by GCash or bank with a
 * proof on it is waiting for staff, not for the runner: no column says so,
 * these fields do.
 *
 * **Proof stops the clock** (T6): such a switch is judged without its
 * `holdUntil`, so neither the link nor the daily sweep reads it as lapsed while
 * staff check it. The event's switch deadline still applies, read by the
 * callers as before. Pure, so the page, the sweep and the staff view share it.
 */

type ProofFields = { status: string; paymentMethod: string | null; proofOfPayment: string | null };

export function switchProofSubmitted(change: ProofFields): boolean {
  return (
    change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT &&
    isOutsidePayment(change.paymentMethod) &&
    change.proofOfPayment !== null
  );
}

/** The hold a switch is judged by: none once its proof is in (T6). */
export function switchHoldUntil<T extends ProofFields & { holdUntil: Date | null }>(change: T): Date | null {
  return switchProofSubmitted(change) ? null : change.holdUntil;
}
