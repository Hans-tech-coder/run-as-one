/**
 * How a new order is written, the same way for every door into it.
 *
 * **The rule this module owns:** a new order — online, by bank transfer, or
 * encoded by staff (STAFF_REGISTRATION_PLAN.md) — is written inside one
 * transaction in this order, and only this order:
 *
 * 1. **claim the payment reference** (lib/payment-reference.ts), first, so a
 *    reused reference is refused before any slot, stock or promo is spent. An
 *    order with no reference (online, free) claims nothing;
 * 2. **lock the event** (lockEventForRegistration);
 * 3. **refuse a runner already registered** here (lib/runner-match.ts),
 *    after the event lock, so two simultaneous orders for one runner cannot
 *    both pass;
 * 4. **reserve slots** — inside the write, not before it, because a count
 *    taken before the create is a count two simultaneous orders can both pass;
 * 5. **reserve add-on stock** under its own row locks (lib/add-on-stock.ts);
 * 6. **redeem the promotions** — the price promotion, then the group deal it
 *    was combined with, always in that order so two combined orders lock the
 *    two rows the same way (lib/promo-winner.ts). Spent when the order is
 *    placed, not when it is paid: a voucher that only counted on payment
 *    could sit on any number of pending orders at once;
 * 7. **create the registration** with its runners and add-ons, every promo
 *    and price figure snapshotted onto the row, since the PromoCode and the
 *    add-on can be edited or deleted and a receipt must keep saying what was
 *    charged.
 *
 * Split out of both checkout routes unchanged (step 0), so the staff door
 * gets the duplicate guard and every lock from the same place.
 */

import type { Prisma } from '@prisma/client';
import { claimReference } from './payment-reference';
import { lockEventForRegistration, reserveSlots } from './registration-gate';
import { assertRunnersNotRegistered } from './runner-match';
import { reserveAddOnStock } from './add-on-stock';
import { categorySeatsClaimed, redeemPromoCode, runnersDiscounted } from './discount';
import { FREE_ORDER_COLUMNS } from './free-checkout';
import { optionalUpperCaseForStorage, upperCaseForStorage } from './text-case';
import { normalizeEmailAddress } from './email-address';
import { storedShirtSize } from './shirt-size';
import { storedGuardianConsent } from './minor-consent';
import { storedRunnerAddress } from './runner-address';
import { runnerCommunity } from './running-community-store';
import { EMAIL_RUNNER_INCLUDE } from './email';
import type { CheckoutPricing } from './checkout-pricing';

type Pricing = Pick<
  CheckoutPricing,
  | 'zone'
  | 'promoOrder'
  | 'lockedAt'
  | 'discount'
  | 'discountAmount'
  | 'free'
  | 'addOnLines'
  | 'addOnTotal'
  | 'addOnRunAsOneTotal'
>;

export type PlaceOrderInput = {
  event: {
    id: string;
    date: unknown;
    categories: Parameters<typeof reserveSlots>[1] & Parameters<typeof storedShirtSize>[1];
  };
  orderRef: string;
  // Untyped JSON off the request, as the routes always read it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  participants: any[];
  pricing: Pricing;
  /** The order's own columns, already checked and cased by the route. */
  order: {
    customerEmail: string;
    customerName: string;
    logisticsMethod: string;
    deliveryAddress: string | null;
    deliveryFee: number;
    subtotal: number;
    platformFee: number;
    transactionFee: number;
    totalAmount: number;
    paymentMethod: string;
    consentSignature: string;
  };
  /** A bank transfer's slip, reference and account. Absent online. */
  payment?: {
    transactionNumber: string | null;
    proofOfPayment: string | null;
    paidTo: string | null;
  };
  /**
   * The staff member who encoded the order (STAFF_REGISTRATION_PLAN.md).
   * Absent on the runner's own checkout, which the column defaults to WEB.
   */
  encodedBy?: { id: string; name: string };
};

export async function placeOrder(tx: Prisma.TransactionClient, input: PlaceOrderInput) {
  const { event, orderRef, participants, pricing, order, payment, encodedBy } = input;
  const { zone, promoOrder, lockedAt, discount, discountAmount, free, addOnLines } = pricing;

  // 1. One reference, one payment. null claims nothing and touches nothing.
  const transactionRef = await claimReference(tx, payment?.transactionNumber ?? null);

  // 2–3. An abandoned QRPh order does not count as registered, so retrying
  // after walking away still works.
  await lockEventForRegistration(tx, event.id);
  await assertRunnersNotRegistered(tx, event.id, participants);
  // 4–5.
  await reserveSlots(tx, event.categories, participants);
  await reserveAddOnStock(tx, addOnLines.flat());

  // 6. The seats at the promotion price this order claims come from the same
  // walk that priced it — so the seats spent and the money taken off can
  // never describe different orders.
  if (discount.promo && discountAmount > 0) {
    await redeemPromoCode(
      tx,
      discount.promo.id,
      discount.promo.code,
      categorySeatsClaimed(discount.promo, promoOrder),
      discount.promo.automatic,
      runnersDiscounted(discount.promo, promoOrder),
    );
  }
  if (discount.combinedPromo && discount.applied?.combined) {
    await redeemPromoCode(
      tx,
      discount.combinedPromo.id,
      discount.combinedPromo.code,
      new Map(),
      discount.combinedPromo.automatic,
    );
  }

  // 7.
  return tx.registration.create({
    data: {
      eventId: event.id,
      orderRef,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      logisticsMethod: order.logisticsMethod,
      // Only meaningful for delivery; pickup leaves it null.
      deliveryZone: zone,
      // Split orders ship to each runner's own row address instead.
      deliveryAddress: order.deliveryAddress,
      deliveryFee: order.deliveryFee,
      subtotal: order.subtotal,
      platformFee: order.platformFee,
      transactionFee: order.transactionFee,
      totalAmount: order.totalAmount,
      discountAmount,
      promoCode: discountAmount > 0 ? discount.applied?.code ?? null : null,
      // Whether the discount was a price the goods were sold at or a
      // deduction from them. See isPricedIn in lib/discount.ts.
      discountType: discountAmount > 0 ? discount.applied?.type ?? null : null,
      // The group deal it was combined with, and its share of discountAmount —
      // which stays the whole discount. See Registration.combinedPromoCode.
      combinedPromoCode: discount.applied?.combined?.code ?? null,
      combinedDiscountAmount: discount.applied?.combined?.amount ?? 0,
      // Only on an order the lock priced. See Registration.priceLockedAt.
      priceLockedAt: lockedAt && discount.heldByLock ? lockedAt : null,
      // Every add-on line on the order, and Run As One's part of it (D1).
      addOnTotal: pricing.addOnTotal,
      addOnRunAsOneTotal: pricing.addOnRunAsOneTotal,
      paymentMethod: order.paymentMethod,
      ...(payment
        ? {
            proofOfPayment: payment.proofOfPayment,
            transactionNumber: payment.transactionNumber,
            transactionRef,
            paidTo: payment.paidTo,
          }
        : {}),
      // Waiting for the webhook or an admin to verify the payment.
      status: 'PENDING',
      // Nothing to collect, so nothing to wait for. Spread *after* the lines
      // above so it has the last word: a free order is written PAID and
      // COMPLIMENTARY with its chargeable amounts forced to zero, which also
      // keeps it out of the queue of transfers to check (lib/free-checkout.ts).
      ...(free ? FREE_ORDER_COLUMNS : {}),
      // Checked by the route; recorded here as the organizer's evidence that
      // the waiver was agreed to for this specific submission.
      consentGiven: true,
      consentGivenAt: new Date(),
      consentSignature: order.consentSignature,
      ...(encodedBy
        ? { source: 'STAFF', createdById: encodedBy.id, createdByName: encodedBy.name }
        : {}),
      runners: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: participants.map((p: any, index: number) => ({
          // 1..n, in the order the wizard collected them: the tail of the
          // reference this runner quotes back (lib/order-ref.ts), so it is
          // written now and never recomputed.
          runnerNo: index + 1,
          categoryId: p.categoryId,
          firstName: upperCaseForStorage(p.firstName),
          lastName: upperCaseForStorage(p.lastName),
          // Trimmed but never cased: the local part of an address is
          // case-sensitive on some mail servers.
          email: normalizeEmailAddress(p.email),
          phone: p.phone,
          gender: upperCaseForStorage(p.gender),
          birthdate: p.birthdate,
          singletSize: storedShirtSize(p, event.categories),
          // The promotion price this runner got a seat at, or null — what the
          // expiry sweep counts to hand back exactly the seats this order
          // took (lib/pending-expiry.ts).
          promoPrice: discount.applied?.salePriceByRunner[index] ?? null,
          emergencyContactName: upperCaseForStorage(p.emergencyContactName),
          emergencyContactPhone: p.emergencyContactPhone,
          medicalConditions: optionalUpperCaseForStorage(p.medicalConditions),
          // Blank answers land on INDEPENDENT RUNNER; the field is optional.
          runningCommunity: runnerCommunity(p),
          // Nulls for a runner who does not need consent, whatever the client
          // sent; the timestamp is always the server's.
          ...storedGuardianConsent(p, event.date),
          ...storedRunnerAddress(p),
          // Each a snapshot of the item as sold (name, price, seller).
          addOns: { create: addOnLines[index] },
        })),
      },
    },
    include: { event: true, runners: { include: EMAIL_RUNNER_INCLUDE } },
  });
}
