/**
 * **How a delivery switch names the receipts it moved**, in the trail and the
 * emails: "RM-A1" or "RM-A1, RM-B2 and RM-C3".
 *
 * This module used to own which receipts share a parcel (LOGISTICS_CHANGE_PLAN.md
 * L6, Revision 1 R4 and R5): a switch to an address another PAID order shipped
 * to rode on it at ₱0, a second receipt to an address still waiting for payment
 * was refused, and a receipt others rode on went back to pickup only after
 * them. The owner retired all three on 2026-10-21 ("Wala dapat libreng
 * delivery kung different transaction or reference order"): a delivery fee is
 * charged per order, so no receipt rides on another's parcel and nothing is
 * left to decide here (`logistics-change.ts` says the rule).
 *
 * Kept free of Prisma, so the expiry sweep and the outcome writes share it.
 */

/** "RM-A1" or "RM-A1, RM-B2 and RM-C3". */
export function refsOf(refs: readonly string[]): string {
  return refs.length <= 1 ? (refs[0] ?? '') : `${refs.slice(0, -1).join(', ')} and ${refs.at(-1)}`;
}
