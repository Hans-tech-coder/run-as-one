/**
 * **What refunding one runner returns, and what it hands back** (REFUND_PLAN.md
 * D1–D10). A solo order is an order of one, so solo and group share this rule.
 *
 * - **The order stays PAID and the refund is its own row that subtracts**
 *   (`RunnerRefund`), because marking the order REFUNDED would take the platform
 *   fee Run As One keeps out of every report, and every other runner of a group.
 * - **D2: the runner gets the entry as paid plus their own add-ons.** The
 *   platform, transaction and delivery fees stay where they are (D9).
 * - **The figure is always `splitOrderMoney` over every runner who paid**, the
 *   already-refunded ones included. The split rescales when a runner is missing,
 *   so leaving one out would change what the next refund, and the runners who
 *   remain, are worth (REFUND_PLAN.md trap 1).
 * - **A refund is worked out from what was paid, or not at all.** The split reads
 *   live category prices, so every runner goes in at the category they checked
 *   out in, and when the stored subtotal still cannot place them the refund is
 *   refused (`priceUnclear`): a proportional guess would underpay the runner,
 *   and on most orders nobody could correct the figure.
 * - **D10: the amount moves only on a Buy X get Y order**, and only down. What
 *   was not returned stays in the organizer's owed by itself, since `collected`
 *   falls only by `amount`.
 * - **D5: a promo goes back per kind** (`promoHandBackFor`), never through the
 *   whole-order `releaseRedemption`, which counts `promoPrice` seats that
 *   PERCENTAGE and FIXED orders do not set.
 *
 * Pure and free of Prisma, so the modal can show what the route will write and
 * `scripts/check-refund.ts` can prove it without a database. The writes live in
 * `refund-store.ts`.
 */

import { DISCOUNT_TYPES, asDiscountType, isPricedIn, limitCountsRunners } from './discount';
import { runnerEntries, splitOrderMoney, type MoneyOrder, type MoneyRunner } from './runner-money';
import { parsePesos } from './settlement';

export const REFUND_STATUSES = { REFUND_DUE: 'REFUND_DUE', REFUNDED: 'REFUNDED', VOIDED: 'VOIDED' } as const;
export type RefundStatus = (typeof REFUND_STATUSES)[keyof typeof REFUND_STATUSES];

/** The statuses in which the money is deducted and the runner is out of the race. */
export const ACTIVE_REFUND_STATUSES: string[] = [REFUND_STATUSES.REFUND_DUE, REFUND_STATUSES.REFUNDED];

export const REFUND_PAID_BY = { RUN_AS_ONE: 'RUN_AS_ONE', ORGANIZER: 'ORGANIZER' } as const;
export type RefundPaidBy = (typeof REFUND_PAID_BY)[keyof typeof REFUND_PAID_BY];

export const REFUND_PAID_BY_LABELS: Record<RefundPaidBy, string> = {
  RUN_AS_ONE: 'Run As One',
  ORGANIZER: 'Organizer',
};

export function asRefundPaidBy(value: unknown): RefundPaidBy | null {
  return value === REFUND_PAID_BY.RUN_AS_ONE || value === REFUND_PAID_BY.ORGANIZER ? value : null;
}

export function isActiveRefund(status: string | null | undefined): boolean {
  return status != null && ACTIVE_REFUND_STATUSES.includes(status);
}

export const MAX_REFUND_REASON = 300;
export const MAX_REFUND_REFERENCE = 100;
export const MAX_APPROVER_NAME = 120;

export type RefundQuoteRunner = MoneyRunner & {
  id: string;
  addOns: { unitPrice: number; quantity: number; soldBy: string }[];
  /** Moved category since checkout: `listPrice` is the old category's, and `promoPrice` was cleared. */
  moved?: boolean;
};

export type RefundQuote = {
  /** What the split says this runner's entry was paid at: the most it can refund. */
  suggestedAmount: number;
  discountShare: number;
  combinedDiscountShare: number;
  addOnOrganizerAmount: number;
  addOnRunAsOneAmount: number;
  /** The fees that stay (D2, D9), for the modal's *kept* lines. */
  keptAdminFee: number;
  keptDeliveryFee: number;
  keptTransactionFee: number;
  /** D10: this order's amount may be lowered. */
  editable: boolean;
  /** A free seat refunds only its add-ons (D10). */
  freeEntry: boolean;
  /** What each runner of this group paid can no longer be told apart, so no refund. */
  priceUnclear: boolean;
};

/**
 * Whether the split would be guessing. A subtotal that no longer matches only
 * matters when runners' entries differ, since an equal share is then still right;
 * and a moved runner's cleared `promoPrice` loses how a group's sale was shared.
 * One runner takes the whole order either way.
 */
function splitIsGuessing(order: MoneyOrder, runners: RefundQuoteRunner[], upchargePerRunner: number): boolean {
  if (runners.length < 2) return false;
  const entries = runnerEntries(runners, upchargePerRunner);
  const sum = entries.reduce((total, entry) => total + entry, 0);
  if (sum !== order.subtotal && entries.some(entry => entry !== entries[0])) return true;
  return order.discountAmount > 0 && isPricedIn(asDiscountType(order.discountType)) && runners.some(runner => runner.moved);
}

/** D10: a Buy X get Y order, alone or combined with a price promotion. */
export function isBuyXGetYOrder(order: Pick<MoneyOrder, 'discountType' | 'combinedDiscountAmount'>): boolean {
  return asDiscountType(order.discountType) === DISCOUNT_TYPES.BUY_X_GET_Y || order.combinedDiscountAmount > 0;
}

/**
 * The refund of `runnerId`, or null when they are not among `runners`.
 * `runners` is every runner who paid on the order, in `runnerNo` order, those
 * already refunded included (trap 1).
 */
export function quoteRefund(
  order: MoneyOrder,
  runners: RefundQuoteRunner[],
  runnerId: string,
  upchargePerRunner: number,
): RefundQuote | null {
  const index = runners.findIndex(runner => runner.id === runnerId);
  if (index < 0) return null;
  const money = splitOrderMoney(order, runners, upchargePerRunner)[index];
  // Their own lines at the snapshotted price and seller (ADD_ONS_PLAN.md D1),
  // never `money.addOns`, which is rescaled when another runner's lines left.
  let addOnOrganizerAmount = 0;
  let addOnRunAsOneAmount = 0;
  for (const line of runners[index].addOns) {
    const cost = line.unitPrice * line.quantity;
    if (line.soldBy === 'RUN_AS_ONE') addOnRunAsOneAmount += cost;
    else addOnOrganizerAmount += cost;
  }
  return {
    suggestedAmount: money.registrationFee,
    discountShare: money.discount,
    combinedDiscountShare: money.combinedDiscount,
    addOnOrganizerAmount,
    addOnRunAsOneAmount,
    keptAdminFee: money.adminFee,
    keptDeliveryFee: money.deliveryFee,
    keptTransactionFee: money.transactionFee,
    editable: isBuyXGetYOrder(order),
    freeEntry: money.freeEntry,
    priceUnclear: splitIsGuessing(order, runners, upchargePerRunner),
  };
}

/** Everything leaving `collected`. */
export function refundTotal(entryAmount: number, quote: Pick<RefundQuote, 'addOnOrganizerAmount' | 'addOnRunAsOneAmount'>): number {
  return entryAmount + quote.addOnOrganizerAmount + quote.addOnRunAsOneAmount;
}

/**
 * The entry staff asked to refund, in centavos. On an order that is not Buy X
 * get Y it must be the split's figure; on one that is, anything from ₱0 up to it.
 */
export function readEntryAmount(raw: unknown, quote: RefundQuote): { value: number | null; error: string | null } {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { value: quote.suggestedAmount, error: null };
  const value = parsePesos(text);
  if (value === null) return { value: null, error: 'Enter the entry amount in pesos, like 700 or 700.50.' };
  if (value > quote.suggestedAmount) {
    return { value: null, error: 'The refund cannot be more than what this runner paid for the entry.' };
  }
  if (!quote.editable && value !== quote.suggestedAmount) {
    return { value: null, error: 'Only a Buy X get Y order can refund less than the entry as paid.' };
  }
  return { value, error: null };
}

/**
 * D7: who pays by default. While Run As One still holds enough of the
 * organizer's money the refund comes out of it; otherwise it was already
 * remitted, and the organizer pays.
 */
export function defaultPaidBy(balance: number, quote: RefundQuote, entryAmount = quote.suggestedAmount): RefundPaidBy {
  return balance >= entryAmount + quote.addOnOrganizerAmount ? REFUND_PAID_BY.RUN_AS_ONE : REFUND_PAID_BY.ORGANIZER;
}

/**
 * D5: a promotion gives back only while it is switched on and inside its dates.
 * Off or expired, there is nothing left for the use to be spent on.
 */
export function promoStillActive(
  promo: { paused: boolean; validFrom: Date | null; validUntil: Date | null },
  now: Date,
): boolean {
  if (promo.paused) return false;
  if (promo.validFrom && promo.validFrom.getTime() > now.getTime()) return false;
  return !(promo.validUntil && promo.validUntil.getTime() < now.getTime());
}

/**
 * What one runner hands back to one promotion (trap 2).
 * - CATEGORY_PRICE: the seat, if this runner sat in one. Its `usageCount`
 *   counts orders, so that goes only with the last runner.
 * - PERCENTAGE, FIXED and FREE_ENTRY count runners: one use, if they got any.
 * - Buy X get Y and the other order-counted kinds: only with the last runner.
 */
export function promoHandBackFor(
  discountType: unknown,
  runner: { hasPromoPrice: boolean; share: number; lastRunner: boolean },
): { uses: number; seat: boolean } {
  if (asDiscountType(discountType) === DISCOUNT_TYPES.CATEGORY_PRICE) {
    return { uses: runner.lastRunner ? 1 : 0, seat: runner.hasPromoPrice };
  }
  if (limitCountsRunners(discountType)) return { uses: runner.share > 0 ? 1 : 0, seat: false };
  return { uses: runner.lastRunner ? 1 : 0, seat: false };
}

/** Why this runner cannot be refunded in v1 (D9), or null when they can. */
export function refundBlockedBy(facts: {
  awaitingCategoryChange: boolean;
  awaitingDeliverySwitch: boolean;
  pricedCategoryChange: boolean;
  priceUnclear: boolean;
}): string | null {
  if (facts.awaitingCategoryChange) {
    return 'This runner has a category change waiting for payment. Cancel it first, then refund.';
  }
  if (facts.awaitingDeliverySwitch) {
    return 'This order has a delivery switch waiting for payment. Cancel it first, then refund.';
  }
  if (facts.pricedCategoryChange) {
    return 'This runner has a category change with money on it, which the refund cannot count yet. Settle this one by hand.';
  }
  if (facts.priceUnclear) {
    return "Prices in this group changed after checkout, so what this runner paid cannot be worked out. Settle this one by hand.";
  }
  return null;
}
