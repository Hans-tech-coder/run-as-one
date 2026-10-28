import { checkoutDelivery } from '@/app/events/[slug]/register/delivery-split';
import {
  addOnLinesTotal,
  availableAddOns,
  readAddOnSelection,
  runAsOneShare,
  type AddOnLine,
  type AddOnRule,
} from '@/lib/add-ons';
import { chargeableTotal, isFreeOrder, platformFeeAfterDiscount, transactionFeeFor } from '@/lib/free-checkout';
import { priceChangedBody, type PriceChangedBody, type PriceChangedFigures } from '@/lib/price-changed';
import { readPriceLock } from '@/lib/price-lock';
import { resolveDiscount } from '@/lib/promo-store';
import { runnerCategories, runnerPrices, subtotalWithUpcharge, type PricedCategory } from '@/lib/shirt-size';

/**
 * **What a checkout order costs, worked out once for both checkout routes:
 * the server's own figures, and the refusal when the posted ones disagree.**
 *
 * `/api/checkout` (PayMongo) and `/api/checkout/manual` (bank transfer) price
 * an order the same way, in the same order, and used to carry that walk twice
 * (`ADD_ONS_PLAN.md` Batch 0 moved it here so a new amount is added in one
 * place, not two):
 *
 * 1. **Delivery fee** from the address the runner gave (delivery-split.ts).
 * 2. **Subtotal**: category prices plus the large-size surcharge. A posted
 *    subtotal or delivery fee that disagrees is refused *before* the
 *    promotions are read, so that 409 carries just those two figures and no
 *    total (lib/price-changed.ts).
 * 3. **Discount**, recomputed from the PromoCode rows under the runner's price
 *    lock — never read off the request.
 * 4. **Add-ons** (ADD_ONS_PLAN.md): each runner's picks re-read against the
 *    items on sale to their category *now* and priced from the item, never
 *    the post. Never discounted (D5), no platform fee (D2), no delivery fee
 *    (D6). Stock is not counted here: that needs the checkout's lock
 *    (`reserveAddOnStock`, add-on-stock.ts).
 * 5. **Platform fee** (`Event.adminFee` per runner, a pacer's waiver applied),
 *    then the **chargeable** total — add-ons included — and whether the order
 *    is **free**. So a ₱0 entry plus a shirt is a paid order (D8).
 * 6. **Transaction fee** on the chargeable total for the stored method — zero
 *    for a bank transfer, which PayMongo never sees, and for a free order —
 *    and the **total** the runner pays.
 *
 * A posted platform fee that disagrees is refused here too, with every figure.
 * The posted *total* is not: the online route checks the payment method
 * between the two, and a request wrong on both must keep getting the method's
 * sentence first. So each route compares the total itself and refuses with
 * `priceChangedBody(figures)`.
 *
 * Every amount is centavos and the server's own (Strix vuln-0014): a figure
 * that arrives from the browser is a suggestion.
 */

type DeliveryEvent = Parameters<typeof checkoutDelivery>[0];

export type CheckoutPricingEvent = DeliveryEvent & {
  id: string;
  organizerId: string;
  categories: PricedCategory[];
  shirtSizeUpcharge: number;
  adminFee: number;
  /** Every add-on on the event; which a runner may buy is decided here. */
  addOns: AddOnRule[];
};

export interface CheckoutPricingInput {
  /** `addOns` is the runner's posted picks, as `readAddOnSelection` reads them. */
  participants: readonly { categoryId: string; singletSize: string; addOns?: unknown }[];
  logisticsMethod: unknown;
  deliveryZone: unknown;
  deliveryAddress: string | null | undefined;
  promoCode: unknown;
  priceLock: unknown;
  /** The stored method (`asPaymentMethod`), which decides the transaction fee. */
  paymentMethod: string | null | undefined;
  /** What the tab posted, in centavos. */
  posted: { subtotal: number; deliveryFee: number; platformFee: number };
}

/** A checkout the pricing refused: hand it back as `NextResponse.json(body, { status })`. */
export interface CheckoutPricingRefusal {
  refusal: { status: 400 | 409; body: { error: string } | PriceChangedBody };
}

export interface CheckoutPricing {
  refusal?: undefined;
  zone: Extract<ReturnType<typeof checkoutDelivery>, { fee: number }>['zone'];
  /** The basis the discount was priced on; the write claims promo seats from it. */
  promoOrder: {
    runnerPrices: number[];
    runnerCategories: ReturnType<typeof runnerCategories>;
    subtotal: number;
  };
  lockedAt: Date | null;
  discount: Awaited<ReturnType<typeof resolveDiscount>>;
  discountAmount: number;
  subtotal: number;
  deliveryFee: number;
  /** Each runner's add-on lines, in runner order; written as `RunnerAddOn` rows. */
  addOnLines: AddOnLine[][];
  addOnTotal: number;
  /** The part of `addOnTotal` Run As One sells and keeps (D1). */
  addOnRunAsOneTotal: number;
  platformFee: number;
  chargeable: number;
  free: boolean;
  transactionFee: number;
  total: number;
  /** Every figure, for a "Prices have changed" refusal. */
  figures: PriceChangedFigures;
}

export async function priceCheckout(
  event: CheckoutPricingEvent,
  input: CheckoutPricingInput,
): Promise<CheckoutPricing | CheckoutPricingRefusal> {
  const { participants, posted } = input;

  const delivery = checkoutDelivery(event, {
    logisticsMethod: input.logisticsMethod,
    deliveryZone: input.deliveryZone,
    deliveryAddress: input.deliveryAddress,
  });
  if ('error' in delivery) {
    return { refusal: { status: 400, body: { error: delivery.error } } };
  }
  const { zone } = delivery;
  const expectedDeliveryFee = delivery.fee;
  // Checked rather than trusted: without this, a client could post a subtotal
  // that leaves out the 4XL surcharge and pay the smaller amount.
  const expectedSubtotal = subtotalWithUpcharge(
    participants,
    event.categories,
    event.shirtSizeUpcharge
  );

  // The admin fee is checked further down instead of here, because a pacer
  // code can waive it (lib/free-checkout.ts) and the code has to be resolved
  // before we know what the fee should be.
  if (
    posted.deliveryFee !== expectedDeliveryFee ||
    posted.subtotal !== expectedSubtotal
  ) {
    return {
      refusal: {
        status: 409,
        // Before the promotions are read, so no total yet (lib/price-changed.ts).
        body: priceChangedBody({ subtotal: expectedSubtotal, deliveryFee: expectedDeliveryFee }),
      },
    };
  }

  // Each runner's add-ons, priced from the items as they stand now. An item
  // switched off, closed, or not open to this runner's category since the page
  // loaded is refused with the sentence saying so, and the runner named, so a
  // group of five knows whose card to look at.
  const now = new Date();
  const addOnLines: AddOnLine[][] = [];
  for (const [index, participant] of participants.entries()) {
    const read = readAddOnSelection(
      participant.addOns,
      availableAddOns(event.addOns, participant.categoryId, now),
    );
    if ('error' in read) {
      const error = participants.length > 1 ? `Runner ${index + 1}: ${read.error}` : read.error;
      return { refusal: { status: 400, body: { error } } };
    }
    addOnLines.push(read.lines);
  }
  const allAddOnLines = addOnLines.flat();
  const addOnTotal = addOnLinesTotal(allAddOnLines);

  // The discount is recomputed from the PromoCode row, never read off the
  // request. A code that expired, filled up or stopped applying since the
  // wizard priced it is refused with the sentence the wizard itself would
  // have shown, because the two run the same check.
  // Named rather than inline because the write needs the same basis: the
  // seats a repricing promotion claims have to come from the walk that priced
  // the order, not from a second one built slightly differently.
  const promoOrder = {
    runnerPrices: runnerPrices(participants, event.categories, event.shirtSizeUpcharge),
    runnerCategories: runnerCategories(participants, event.categories),
    subtotal: expectedSubtotal,
  };
  // The runner's price lock, if the wizard sent one (lib/price-lock.ts). A
  // missing, forged or expired token, or one taken on another event, reads as
  // no lock and the order is priced at now.
  const lockedAt = await readPriceLock(input.priceLock, event.id);
  const discount = await resolveDiscount(event, input.promoCode, promoOrder, lockedAt?.getTime() ?? null);
  if (discount.error) {
    return { refusal: { status: 400, body: { error: discount.error } } };
  }
  const discountAmount = discount.applied?.amount ?? 0;

  // With a pacer's waiver applied if the winning code carries one: a client
  // that posted a waived fee it had not earned would be handing itself Run As
  // One's commission.
  const expectedPlatformFee = platformFeeAfterDiscount(
    event.adminFee,
    participants.length,
    discount.applied,
  );
  // Whether there is anything left to collect — from figures recomputed here,
  // never from the request. A free order skips PayMongo and the deposit slip,
  // so a posted `amount: 0` must not be able to reach this. See
  // lib/free-checkout.ts.
  const chargeable = chargeableTotal({
    subtotal: expectedSubtotal,
    deliveryFee: expectedDeliveryFee,
    platformFee: expectedPlatformFee,
    discountAmount,
    addOnTotal,
  });
  const free = isFreeOrder(chargeable);

  // From the *stored* method, and only for one PayMongo actually charges a fee
  // on: the raw value would price "gcash" at no fee while PayMongo still took
  // its cut from the organizer. A bank transfer has no rate, so it is zero.
  const expectedTransactionFee = transactionFeeFor(chargeable, input.paymentMethod);
  const expectedTotal = chargeable + expectedTransactionFee;

  // Worked out before the admin-fee check, all of it pure arithmetic, so that
  // refusal can name the total too.
  const figures = {
    subtotal: expectedSubtotal,
    deliveryFee: expectedDeliveryFee,
    discount: discountAmount,
    platformFee: expectedPlatformFee,
    addOnTotal,
    transactionFee: expectedTransactionFee,
    total: expectedTotal,
  };
  if (posted.platformFee !== expectedPlatformFee) {
    return { refusal: { status: 409, body: priceChangedBody(figures) } };
  }

  return {
    zone,
    promoOrder,
    lockedAt,
    discount,
    discountAmount,
    subtotal: expectedSubtotal,
    deliveryFee: expectedDeliveryFee,
    addOnLines,
    addOnTotal,
    addOnRunAsOneTotal: runAsOneShare(allAddOnLines),
    platformFee: expectedPlatformFee,
    chargeable,
    free,
    transactionFee: expectedTransactionFee,
    total: expectedTotal,
    figures,
  };
}
