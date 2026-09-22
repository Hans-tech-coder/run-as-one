import { platformFeeAfterDiscount } from '@/lib/discount';
import { PAYMENT_METHODS } from '@/lib/registration-codes';

/**
 * **The ₱0 order: when one is real, and what it is written as.**
 *
 * An order can cost nothing. Today that is a pacer whose free entry also
 * waives Run As One's admin fee (`PACER_DISCOUNT_PLAN.md`), and it is the only
 * way to get there on a normal race — but the rule here is deliberately about
 * the *total*, not about pacers, because an organizer who sets their admin fee
 * to zero and runs a 100%-off code lands in exactly the same place, and
 * PayMongo cannot charge ₱0 either way. **PayMongo rejects a zero-amount
 * charge**, so an order that reached it with nothing to collect would fail at
 * the last step, after the registration had already been written and the slot
 * taken. This module is what keeps it from getting there.
 *
 * **Free-ness is decided on the server and nowhere else.** Both checkout
 * routes already recompute the subtotal, the delivery fee, the admin fee and
 * the discount from the database and refuse an order whose posted total
 * disagrees (409, "Prices have changed"). `isFreeOrder` is asked of *that*
 * recomputed figure, never of anything in the request — otherwise a posted
 * `totalAmount: 0` would be all it took to register for a race for nothing.
 * The wizards call the same function on their own arithmetic so the button
 * says the right thing, but a wizard that is wrong about it simply gets a 409.
 *
 * Kept free of Prisma, like `discount.ts` beside it, because both wizards are
 * client components and import this to decide whether to show a payment step
 * at all.
 */

/**
 * The admin fee this order owes, with a pacer's waiver applied.
 *
 * Re-exported here rather than made a second rule: the arithmetic lives in
 * `discount.ts`, beside the "fees are never discounted" doctrine it is the one
 * exception to, and this is where the checkout side of the feature looks for
 * it. One name, one behaviour, four call sites.
 */
export { platformFeeAfterDiscount };

/**
 * What this order is chargeable for before the payment processor's own cut.
 *
 * The transaction fee is deliberately outside it. That fee is a share of what
 * PayMongo actually processes, so it is worked out *from* this number — asking
 * "is there anything to charge?" while including the charge for charging it
 * would be circular, and an order at zero would pick up a fee on nothing.
 */
export function chargeableTotal(amounts: {
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  discountAmount: number;
}): number {
  return (
    amounts.subtotal + amounts.deliveryFee + amounts.platformFee - amounts.discountAmount
  );
}

/**
 * Whether there is nothing left to collect.
 *
 * `<= 0` rather than `=== 0` only as a floor: every discount branch in
 * `discount.ts` is capped at what it discounts and every fee is non-negative,
 * so this cannot actually go below zero — but if it ever did, the answer that
 * skips the payment processor is the safe one, and the routes still pin the
 * posted total at exactly 0 before writing anything.
 */
export function isFreeOrder(chargeable: number): boolean {
  return chargeable <= 0;
}

/**
 * The payment columns a free order is written with.
 *
 * **`PAID`, not `PENDING`.** Every other order starts pending because money
 * has to arrive or be verified; here there is nothing to wait for, and leaving
 * the pacer pending would put a fictional payment into the organizer's
 * validation queue and hold the runner's own confirmation hostage to it.
 *
 * The three amounts are forced to zero rather than copied from the request.
 * The request has already been checked against a recomputed total, so they
 * should agree — but "should agree" is not the standard for the columns a
 * receipt and a settlement are read from, and a transaction fee on an order
 * nobody processed is a number with no meaning at all.
 */
export const FREE_ORDER_COLUMNS = {
  paymentMethod: PAYMENT_METHODS.COMPLIMENTARY,
  status: 'PAID',
  platformFee: 0,
  transactionFee: 0,
  totalAmount: 0,
} as const;

/**
 * **A free order gets the receipt, not the acknowledgement.**
 *
 * Both checkout routes send "registration received — we are waiting for your
 * payment" the moment an order is placed, and the confirmation only once the
 * money is in. On a free order there is nothing to wait for and nothing left
 * that could fail, so the first mail would be asking the pacer to do something
 * that does not exist. They get the confirmation straight away instead — the
 * same mail every other runner eventually gets, without the wait in the
 * middle.
 *
 * Written here as the rule and applied in each route beside its own
 * `deliverReceivedEmail` / `deliverConfirmationEmail` import, because this
 * module stays free of Prisma so the wizards can keep importing it.
 */
export const FREE_ORDER_EMAIL_NOTE =
  'A free order is confirmed on placement, so it is sent the receipt rather than the acknowledgement.';

/** What the wizard's last button says when there is nothing to pay. */
export const FREE_ORDER_SUBMIT_LABEL = 'Complete registration';

/** And what the summary calls a total of zero, instead of "Total Amount to Pay". */
export const FREE_ORDER_TOTAL_LABEL = 'Nothing to Pay';
