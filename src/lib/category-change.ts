/**
 * **What moving a paid runner to another category costs, and when it may
 * happen** (CATEGORY_CHANGE_PLAN.md D3–D13).
 *
 * Runners ask staff, by chat, to switch "5K → 10K" or back down after paying.
 * The order and its receipt are never edited (D1): the move is its own
 * `CategoryChange` row, and every figure on it comes from `quoteCategoryChange`
 * here. One function because the modal that previews the quote, the route that
 * writes it and the email that reports it must agree to the centavo — a modal
 * that showed ₱400 due and a link that charged ₱412 would be the worst bug this
 * feature could have.
 *
 * **One formula** (D8): `amount = (toPrice − basis) + changeFee`. Above zero the
 * change waits for payment; at or below zero it applies at once, and under
 * REFUND_DIFFERENCE the runner is owed `−amount`. Upgrade, lateral and downgrade,
 * with or without a fee, are the same arithmetic — there is no special case to
 * get wrong. The new category is charged at its **list** price (D4), never at a
 * running sale, so a change spends no promo seat.
 *
 * **The basis** — what this runner is taken to have paid for the entry (D3) —
 * is their `promoPrice` or the old list price, less their even share of an
 * order-level deduction (a buy-X-get-Y or pacer comp, the kinds `isPricedIn`
 * says are not priced into the runner). Those, and a ₱0 order, have no clean
 * per-runner figure, so the quote says it is an estimate and why; staff may
 * override it with a reason.
 *
 * Kept free of Prisma, like `discount.ts`, so the modal's live preview runs the
 * same code as the route. The writes — under the event lock, with an audit row
 * each — belong to the server-only store (Session 2).
 */

import { isPricedIn } from './discount';
import { isPayMongoMethod, raceEntryIsFree, transactionFeeFor } from './free-checkout';
import { eventInstant } from './event-schedule';
import { parsePesos } from './settlement';

// ── Status vocabulary ────────────────────────────────────────────────────────

export const CATEGORY_CHANGE_STATUSES = {
  /** An upgrade waiting for its payment; holds a seat in the new category (D11). */
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  /** Moved: paid, or nothing to pay, or a downgrade with nothing given back. */
  APPLIED: 'APPLIED',
  /** Moved, and a refund is owed under REFUND_DIFFERENCE. */
  REFUND_DUE: 'REFUND_DUE',
  /** Moved, and staff recorded the refund's reference. */
  REFUNDED: 'REFUNDED',
  /** Staff withdrew an awaiting upgrade; its held seat is released. */
  CANCELLED: 'CANCELLED',
  /** An awaiting upgrade ran out of time unpaid; its held seat is released. */
  EXPIRED: 'EXPIRED',
} as const;

export type CategoryChangeStatus =
  (typeof CATEGORY_CHANGE_STATUSES)[keyof typeof CATEGORY_CHANGE_STATUSES];

const STATUS_VALUES = Object.values(CATEGORY_CHANGE_STATUSES) as string[];

/**
 * Narrows a stored or posted value to a status, or null when it is none.
 * Null rather than a fallback: a change is money in flight, and guessing what
 * an unrecognised row means would either hold a seat it should not or apply a
 * move nobody paid for.
 */
export function asCategoryChangeStatus(value: unknown): CategoryChangeStatus | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return STATUS_VALUES.includes(code) ? (code as CategoryChangeStatus) : null;
}

/** The one open status (D10): at most one per runner, and it holds a seat. */
export function isOpenChange(status: unknown): boolean {
  return asCategoryChangeStatus(status) === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT;
}

/** The statuses in which the runner now stands in the new category. */
export function hasMoved(status: unknown): boolean {
  const s = asCategoryChangeStatus(status);
  return (
    s === CATEGORY_CHANGE_STATUSES.APPLIED ||
    s === CATEGORY_CHANGE_STATUSES.REFUND_DUE ||
    s === CATEGORY_CHANGE_STATUSES.REFUNDED
  );
}

export const CATEGORY_CHANGE_STATUS_LABELS: Record<CategoryChangeStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  APPLIED: 'Changed',
  REFUND_DUE: 'Refund due',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

/** Badge tones, the same three `PROMO_STATUS_TONES` uses. */
export const CATEGORY_CHANGE_STATUS_TONES: Record<
  CategoryChangeStatus,
  'success' | 'pending' | 'neutral'
> = {
  AWAITING_PAYMENT: 'pending',
  APPLIED: 'success',
  REFUND_DUE: 'pending',
  REFUNDED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

// ── Per-event settings ───────────────────────────────────────────────────────

export const DOWNGRADE_REFUND_POLICIES = {
  /** The default: a move down applies, and the difference is not given back. */
  NO_REFUND: 'NO_REFUND',
  /** A move down owes the runner the difference, less any change fee. */
  REFUND_DIFFERENCE: 'REFUND_DIFFERENCE',
} as const;

export type DowngradeRefundPolicy =
  (typeof DOWNGRADE_REFUND_POLICIES)[keyof typeof DOWNGRADE_REFUND_POLICIES];

/**
 * Anything unrecognised reads as NO_REFUND, so a junk value in the column can
 * never promise a runner money back.
 */
export function asDowngradeRefundPolicy(value: unknown): DowngradeRefundPolicy {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return code === DOWNGRADE_REFUND_POLICIES.REFUND_DIFFERENCE
    ? DOWNGRADE_REFUND_POLICIES.REFUND_DIFFERENCE
    : DOWNGRADE_REFUND_POLICIES.NO_REFUND;
}

// ── When a change may happen ─────────────────────────────────────────────────

type DeadlineEvent = { date: string; categoryChangeUntil?: Date | string | null };

/**
 * The last moment a change may be made, and when every open one expires (D12).
 *
 * Null on the event means **until the day before race day** — owner's
 * confirmation, 2026-10-18 — so changes close at 00:00 Manila on `Event.date`,
 * when bibs, singlets and kits are final. For a virtual run `date` is the first
 * day of its window, and the same rule holds: its kits ship from then.
 * Null only when the event's day is unreadable, which callers treat as closed.
 */
export function categoryChangeDeadline(event: DeadlineEvent): Date | null {
  if (event.categoryChangeUntil) {
    const set = new Date(event.categoryChangeUntil);
    return Number.isNaN(set.getTime()) ? null : set;
  }
  return eventInstant(event.date, '00:00');
}

export type ChangeRefusal =
  | 'ORDER_NOT_PAID'
  | 'RUNNER_REMOVED'
  | 'OPEN_CHANGE'
  | 'PAST_DEADLINE'
  | 'HAS_RESULT'
  | 'SAME_CATEGORY';

export type ChangeEligibility = { allowed: true } | { allowed: false; reason: ChangeRefusal; message: string };

/**
 * Whether staff may start a change for this runner now, and if not, the one
 * sentence that says why — shown in place of the modal's confirm button and
 * returned by the route as its refusal.
 *
 * Checked in this order, so the message names the first thing staff can do
 * something about: PAID orders only (D9 — a PENDING one is paid or expires
 * first), a live runner, no open change already (D10 — cancel it first), the
 * deadline (D12), and no race result yet (a time recorded in one category
 * cannot be moved to another).
 */
export function canChangeCategory(input: {
  orderStatus: string;
  runnerRemoved?: boolean;
  hasOpenChange: boolean;
  hasRaceResult: boolean;
  event: DeadlineEvent;
  fromCategoryId?: string;
  toCategoryId?: string;
  now?: Date;
}): ChangeEligibility {
  const refuse = (reason: ChangeRefusal, message: string): ChangeEligibility => ({
    allowed: false,
    reason,
    message,
  });
  if (input.orderStatus.trim().toUpperCase() !== 'PAID') {
    return refuse(
      'ORDER_NOT_PAID',
      'Only a paid registration can change category. Validate or settle the payment first.',
    );
  }
  if (input.runnerRemoved) return refuse('RUNNER_REMOVED', 'This runner has been removed from the order.');
  if (input.hasOpenChange) {
    return refuse(
      'OPEN_CHANGE',
      'This runner already has a category change waiting for payment. Cancel it before starting another.',
    );
  }
  const deadline = categoryChangeDeadline(input.event);
  if (!deadline || (input.now ?? new Date()).getTime() >= deadline.getTime()) {
    return refuse('PAST_DEADLINE', 'Category changes for this race have closed.');
  }
  if (input.hasRaceResult) {
    return refuse('HAS_RESULT', 'This runner already has a race result, so their category cannot change.');
  }
  if (input.fromCategoryId && input.fromCategoryId === input.toCategoryId) {
    return refuse('SAME_CATEGORY', 'Choose a different category from the one this runner is in.');
  }
  return { allowed: true };
}

// ── The quote ────────────────────────────────────────────────────────────────

/** Why a basis is an estimate, for the modal's one-line explanation. */
export type BasisEstimateReason = 'ORDER_DISCOUNT' | 'FREE_ORDER';

export const BASIS_ESTIMATE_COPY: Record<BasisEstimateReason, string> = {
  ORDER_DISCOUNT:
    "This order had a discount taken off the whole order, so this runner's share is an even split and may not match what they feel they paid.",
  FREE_ORDER:
    'This order cost nothing, so there is no paid amount to credit. Adjust the basis if the runner should be credited something.',
};

export type QuoteInput = {
  /** The old category's list price, centavos. */
  fromPrice: number;
  /** The new category's list price, centavos (D4). */
  toPrice: number;
  /** `Runner.promoPrice`: what a repricing promotion sold this runner's seat at. */
  promoPrice: number | null;
  order: {
    discountAmount: number;
    discountType: string | null;
    totalAmount: number;
    /** The order's add-ons and PayMongo cut: taken off the total to judge the entry (D8). */
    addOnTotal: number;
    transactionFee: number;
    /**
     * Every runner the order was priced for, removed ones included: an
     * order-level discount was spread over all of them at checkout.
     */
    runnerCount: number;
  };
  event: { categoryChangeFee: number; downgradeRefundPolicy: string };
  /**
   * How an upgrade will be paid, in the stored form (`QRPH`, `BANK_TRANSFER`).
   * Null before staff choose: the quote then shows no transaction fee.
   */
  paymentMethod?: string | null;
  /** Staff's override of the computed basis (D3), already validated. */
  basisAdjustment?: { basis: number; reason: string } | null;
};

export type CategoryChangeQuote = {
  /** By the price difference alone, before the fee. */
  direction: 'UPGRADE' | 'LATERAL' | 'DOWNGRADE';
  /** What D3 computes; shown beside `basis` when staff adjusted it. */
  computedBasis: number;
  basis: number;
  basisEstimated: boolean;
  estimateReason: BasisEstimateReason | null;
  basisAdjustReason: string | null;
  toPrice: number;
  changeFee: number;
  /** toPrice − basis; negative on a downgrade. */
  difference: number;
  /** difference + changeFee (D8). */
  amount: number;
  /** PayMongo's cut on an online upgrade, the runner's (D13). */
  transactionFee: number;
  /** What an upgrade collects: amount + transactionFee, else 0. */
  totalCharged: number;
  /** What a downgrade gives back under REFUND_DIFFERENCE, else 0. */
  refundAmount: number;
  /** What a downgrade under NO_REFUND leaves with Run As One, for the email. */
  forfeited: number;
  /** The status the change is written in. */
  status: CategoryChangeStatus;
};

/**
 * The computed basis (D3): what this runner is taken to have paid for the
 * entry, before any adjustment.
 *
 * The share of an order-level deduction is rounded **down**, so a remainder
 * centavo stays with the runner's basis — the runner is never charged a
 * centavo more, or refunded one less, because of how a split fell.
 */
export function computeBasis(input: Pick<QuoteInput, 'fromPrice' | 'promoPrice' | 'order'>): {
  basis: number;
  estimateReason: BasisEstimateReason | null;
} {
  const entry = input.promoPrice ?? input.fromPrice;
  const { discountAmount, discountType, runnerCount } = input.order;

  // The entry, not the whole order: a pacer's free entry plus a ₱350 shirt
  // is a ₱350 order whose entry still cost nothing (ADD_ONS_PLAN.md D8).
  if (raceEntryIsFree(input.order)) return { basis: 0, estimateReason: 'FREE_ORDER' };

  if (discountAmount > 0 && !isPricedIn(discountType)) {
    const share = Math.floor(discountAmount / Math.max(1, runnerCount));
    return { basis: Math.max(0, entry - share), estimateReason: 'ORDER_DISCOUNT' };
  }
  return { basis: entry, estimateReason: null };
}

/** The whole quote for one change (D3, D4, D6, D8, D13). */
export function quoteCategoryChange(input: QuoteInput): CategoryChangeQuote {
  const computed = computeBasis(input);
  const adjusted = input.basisAdjustment ?? null;
  const basis = adjusted ? adjusted.basis : computed.basis;

  const changeFee = Math.max(0, input.event.categoryChangeFee);
  const difference = input.toPrice - basis;
  const amount = difference + changeFee;

  // D13: on top, exactly as at checkout, and only when PayMongo collects it.
  const transactionFee =
    amount > 0 && isPayMongoMethod(input.paymentMethod ?? null)
      ? transactionFeeFor(amount, input.paymentMethod)
      : 0;

  const refunds =
    asDowngradeRefundPolicy(input.event.downgradeRefundPolicy) ===
    DOWNGRADE_REFUND_POLICIES.REFUND_DIFFERENCE;
  const owedBack = amount < 0 ? -amount : 0;

  const status: CategoryChangeStatus =
    amount > 0
      ? CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT
      : owedBack > 0 && refunds
        ? CATEGORY_CHANGE_STATUSES.REFUND_DUE
        : CATEGORY_CHANGE_STATUSES.APPLIED;

  return {
    direction: difference > 0 ? 'UPGRADE' : difference < 0 ? 'DOWNGRADE' : 'LATERAL',
    computedBasis: computed.basis,
    basis,
    // An adjusted basis is staff's own figure, not an estimate of the app's.
    basisEstimated: !adjusted && computed.estimateReason !== null,
    estimateReason: adjusted ? null : computed.estimateReason,
    basisAdjustReason: adjusted ? adjusted.reason : null,
    toPrice: input.toPrice,
    changeFee,
    difference,
    amount,
    transactionFee,
    totalCharged: amount > 0 ? amount + transactionFee : 0,
    refundAmount: refunds ? owedBack : 0,
    forfeited: refunds ? 0 : owedBack,
    status,
  };
}

/**
 * Staff's override of the basis, as posted: pesos → centavos and a reason, or
 * the sentence saying what is missing. Null value with no error means no
 * override was asked for.
 */
export function readBasisAdjustment(
  rawBasis: unknown,
  rawReason: unknown,
): { value: { basis: number; reason: string } | null; error: string | null } {
  const text =
    typeof rawBasis === 'string' ? rawBasis.trim() : typeof rawBasis === 'number' ? String(rawBasis) : '';
  if (!text) return { value: null, error: null };
  const basis = parsePesos(text);
  if (basis === null) return { value: null, error: 'Enter the amount paid in pesos, like 900 or 900.50' };
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (!reason) return { value: null, error: 'Say why the amount paid was changed' };
  return { value: { basis, reason }, error: null };
}

// ── References and the kit ───────────────────────────────────────────────────

/** "RM-D918005C-2-C1": the runner's reference and which change of theirs it is. */
export function categoryChangeRef(runnerReference: string, changeNo: number): string {
  return `${runnerReference}-C${changeNo}`;
}

/**
 * What the kit team has to swap (D7): inclusions the new option has and the old
 * did not, and the reverse. Compared trimmed and case-blind, because the two
 * lists were typed separately by an organizer and "Finisher medal" against
 * "Finisher Medal" is the same medal. Each side keeps its own spelling.
 */
export function kitDifference(
  from: readonly string[],
  to: readonly string[],
): { added: string[]; removed: string[]; changed: boolean } {
  const key = (item: string) => item.trim().toLowerCase();
  const fromKeys = new Set(from.map(key).filter(Boolean));
  const toKeys = new Set(to.map(key).filter(Boolean));
  const added = to.filter(item => key(item) && !fromKeys.has(key(item)));
  const removed = from.filter(item => key(item) && !toKeys.has(key(item)));
  return { added, removed, changed: added.length > 0 || removed.length > 0 };
}
