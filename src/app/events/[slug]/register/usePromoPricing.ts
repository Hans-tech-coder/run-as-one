"use client";

import { useMemo } from "react";
import {
  applyPromo,
  categorySalePrices,
  coversOneRunner,
  freeSlotOffer,
  promoCodeError,
  promoGroupSize,
  promoStatus,
  type PromoTerms,
} from "@/lib/discount";
import {
  bestDiscountLocked,
  discountIncludesCode,
  outshoneByMessage,
} from "@/lib/promo-winner";
import {
  chargeableTotal,
  isFreeOrder,
  platformFeeAfterDiscount,
} from "@/lib/free-checkout";
import { MAX_RUNNERS_PER_ORDER } from "@/lib/order-size";
import {
  runnerCategories,
  runnerPrices,
  totalShirtSizeUpcharge,
} from "@/lib/shirt-size";

/**
 * What an order costs before the payment method is chosen, for both wizards.
 *
 * The PayMongo and bank-transfer wizards priced their orders with the same
 * forty lines, copied; this is those lines once, so the two summaries cannot
 * drift apart. What stays in each wizard is only what differs: the PayMongo
 * wizard adds a transaction fee on the payment step, a bank transfer has none.
 *
 * Every amount is in centavos (integers), so these sums are exact. Nothing is
 * stored: the order keeps moving — a fifth runner joins, delivery becomes
 * pickup — and a figure frozen at the moment a code was typed would quietly
 * stop matching what the checkout route recomputes as its last word.
 *
 * **Under a price lock** (usePriceLock.ts) the order is priced the way the
 * checkout routes price it: the promotions at the moment the lock was taken
 * and at now, whichever gives more (`bestDiscountLocked`, R2). The picker's
 * sale prices are read at the lock's moment, so an early bird the runner
 * started under keeps showing on its card after it has closed.
 */

type PricedEvent = {
  categories: { id: string; price: number }[];
  shirtSizeUpcharge?: number | null;
};

type PricedRunner = { categoryId: string; singletSize: string };

export function usePromoPricing({
  event,
  participants,
  promo,
  automaticPromos,
  adminFeePerRunner,
  deliveryFee,
  addOnTotal = 0,
  lockedAt,
  now,
}: {
  event: PricedEvent;
  participants: readonly PricedRunner[];
  /** The code the runner has applied, or null. */
  promo: PromoTerms | null;
  automaticPromos: PromoTerms[];
  adminFeePerRunner: number;
  deliveryFee: number;
  /**
   * The order's add-ons (useAddOnTotals.ts). Read only for whether the order
   * is free: a ₱0 entry plus a shirt is a paid order (ADD_ONS_PLAN.md D8),
   * and no promotion here ever prices an add-on (D5).
   */
  addOnTotal?: number;
  /** Epoch ms of the price lock, or null without one. */
  lockedAt: number | null;
  /** The wizard's clock (usePriceLock), which moves when a promotion does. */
  now: number;
}) {
  const categoryTotal = participants.reduce((total, p) => {
    const cat = event.categories.find((c) => c.id === p.categoryId);
    return total + (cat ? cat.price : 0);
  }, 0);

  // 4XL and above cost the organizer more to produce, so an event may add a
  // flat amount for each runner in one. Charged only to runners who are
  // actually getting a shirt — see totalShirtSizeUpcharge.
  const shirtSizeUpcharge = event.shirtSizeUpcharge ?? 0;
  const sizeUpcharge = totalShirtSizeUpcharge(
    participants,
    event.categories,
    shirtSizeUpcharge,
  );

  // The surcharge is part of what the runner pays for goods, so it belongs in
  // the subtotal the server re-derives and checks at checkout.
  const subtotal = categoryTotal + sizeUpcharge;

  // The options an automatic promotion has repriced, so each card quotes the
  // same two numbers the event page did. It is the same call that page makes
  // and the same rule the summary charges by: the picker shows the new price
  // on the option, and the summary reaches it by subtracting the discount from
  // the list total, which is what the receipt and the organizer's Given column
  // both count.
  // Under a lock the discount is the better of the two moments
  // (`bestDiscountLocked`), so each card quotes the lower of its two sale
  // prices — a sale that started after the first keystroke shows on the card
  // as it does in the summary.
  const salePrices = useMemo(() => {
    const atNow = categorySalePrices(automaticPromos, event.categories, now);
    if (lockedAt === null) return atNow;
    const held = categorySalePrices(automaticPromos, event.categories, lockedAt);
    for (const [categoryId, price] of atNow) {
      const other = held.get(categoryId);
      if (!other || price.salePrice < other.salePrice) held.set(categoryId, price);
    }
    return held;
  }, [automaticPromos, event.categories, lockedAt, now]);

  // What the applied code is worth right now, from the same module the
  // checkout route uses as its last word (lib/discount.ts) — so what this
  // summary promises and what the server bills cannot disagree. A code that
  // has stopped qualifying keeps its box but takes nothing off, and says why.
  const promoOrder = {
    runnerPrices: runnerPrices(participants, event.categories, shirtSizeUpcharge),
    runnerCategories: runnerCategories(participants, event.categories),
    subtotal,
  };
  // Under a lock a typed code is a problem only when it fails at both moments,
  // explained by why it fails now — the rule resolveDiscount checks it by.
  const problemNow = promo ? promoCodeError(promo, promoOrder, promo.code) : null;
  const promoProblem =
    promo && problemNow && lockedAt !== null
      ? promoCodeError(promo, promoOrder, promo.code, lockedAt) && problemNow
      : problemNow;

  // One discount, unless the organizer marked a price promotion and a group
  // deal as combinable (lib/promo-winner.ts). The automatic promotions and the
  // typed code are weighed together and the largest wins — an early bird
  // stacking on top of a voucher nobody allowed is a number the organizer
  // never agreed to.
  const discount = bestDiscountLocked(
    [...automaticPromos, promoProblem ? null : promo],
    promoOrder,
    lockedAt,
  );
  const discountAmount = discount?.amount ?? 0;

  // Platform Fee (per participant, set per event), less a pacer's waiver where
  // the winning code carries one. Computed after the discount rather than
  // before, because that waiver is the one thing in this app that can reach a
  // fee — the rule is `platformFeeAfterDiscount`, which the checkout route
  // runs again as its last word, so the summary and the charge cannot disagree.
  const adminFeeWaived = discount?.waivesAdminFee === true;
  const platformFee = platformFeeAfterDiscount(
    adminFeePerRunner,
    participants.length,
    discount,
  );

  // Nothing left to collect — a pacer's free entry with the fee waived, or any
  // other order that happens to come to zero. Such an order takes the free
  // path: no payment, and a registration confirmed the moment it is placed.
  // The server decides this again from its own figures; this copy only decides
  // what the wizard draws. See lib/free-checkout.ts.
  const isFree = isFreeOrder(
    chargeableTotal({ subtotal, deliveryFee, platformFee, discountAmount, addOnTotal }),
  );

  // A good code that simply lost. Not an error — nothing is wrong with it and
  // it stays unspent — but saying nothing would look like the box was broken.
  const typedApplied = promoProblem ? null : applyPromo(promo, promoOrder);
  const promoOutshone =
    promo && !promoProblem && discount && !discountIncludesCode(discount, promo.code)
      ? outshoneByMessage(promo.code, discount)
      : null;

  // Which cards wear the FREE badge, and the offer that gets a group to the
  // point where one of them can.
  const freeRunners = new Set(discount?.freeRunners ?? []);

  // The promotion that would give the free slot, whether or not it is
  // currently the winning discount: an order sitting one runner short of it
  // has no discount at all yet, so the offer cannot be read off the winner.
  // Only one that is actually running: a paused, expired or used-up group deal
  // must neither stop a group at its size nor promise a free runner the
  // checkout will not give. Under a lock, running at either moment counts,
  // as it does for the discount itself.
  const groupPromo = [...automaticPromos, promo].find(
    (candidate) =>
      candidate &&
      candidate.discountType === "BUY_X_GET_Y" &&
      (promoStatus(candidate, now) === "ACTIVE" ||
        (lockedAt !== null && promoStatus(candidate, lockedAt) === "ACTIVE")),
  );
  const groupOffer = freeSlotOffer(groupPromo, participants.length);

  // And where that group ends. One registration covers one group: at buy + get
  // the promotion is fully claimed, so step 1 stops taking runners and the
  // seventh member of a group on a "register 5, get 1" starts a registration
  // of their own. Kept in step with `promoGroupSize`, which is what the
  // checkout pays out on.
  const groupLimit = promoGroupSize(groupPromo);
  const atGroupLimit = groupLimit !== null && participants.length >= groupLimit;
  // A code that only ever covers one runner — a free entry or a pacer code —
  // and is applied: step 1 takes nobody else while it is on the order, since
  // a second runner would make the checkout drop it. Only while it is good;
  // a code already refused is not holding anything.
  const soloCode =
    promo && !promoProblem && coversOneRunner(promo) ? promo.code : null;
  const atSoloLimit = soloCode !== null && participants.length >= 1;
  // The ceiling every order has, promotion or not (lib/order-size.ts). Kept
  // apart from the limits above so one notice, not two, explains the button.
  const atOrderLimit =
    !atGroupLimit && !atSoloLimit && participants.length >= MAX_RUNNERS_PER_ORDER;

  return {
    sizeUpcharge,
    subtotal,
    salePrices,
    promoProblem,
    discount,
    discountAmount,
    adminFeeWaived,
    platformFee,
    isFree,
    typedApplied,
    promoOutshone,
    freeRunners,
    groupPromo,
    groupOffer,
    groupLimit,
    atGroupLimit,
    soloCode,
    atSoloLimit,
    atOrderLimit,
  };
}
