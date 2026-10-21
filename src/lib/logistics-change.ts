/**
 * **What switching a paid order between kit pickup and delivery costs, and
 * when it may happen** (LOGISTICS_CHANGE_PLAN.md L3, L5, L9, L11, L13, and the
 * owner's per-order delivery fee of 2026-10-21, which replaced L6).
 *
 * After paying, runners ask staff by chat to have a pickup kit shipped instead.
 * The order's receipt is never edited (L4): the switch is its own
 * `LogisticsChange` row, and its fee comes from `quoteLogisticsChange` here.
 * One function because the modal that previews the fee and the route that
 * writes it must agree to the centavo.
 *
 * **A delivery fee is charged per order** (the owner, 2026-10-21: "Wala dapat
 * libreng delivery kung different transaction or reference order"). Every kit
 * on the receipt ships as one parcel and pays its address's tier. Only the
 * runners inside one order — a group registration — share a parcel, which they
 * do because a switch moves the whole order (L2). A switch never rides at ₱0
 * on another order's paid parcel, whatever the address, email or contact: the
 * quote is given no other order to match, so no address can make it free.
 * This replaced L6 (and with it R4 and R5), under which a switch to an address
 * another PAID order shipped to rode on it free; the `ridesOnRegistrationId`
 * column it wrote stays, read only for old rows, and is never written now.
 *
 * **Staff never type a fee** (L5). The tier comes from the address with the
 * checkout's own function (`checkoutDelivery`), so a switch and a checkout
 * to the same address always cost the same. A zone the event does not
 * deliver to is refused, with the checkout's own sentence. Delivery → Pickup
 * is ₱0 and gives nothing back (L9). There is no Run As One fee in v1 (L7);
 * an online switch adds PayMongo's transaction fee on top, as an upgrade does.
 *
 * Kept free of Prisma, like `category-change.ts`, so the modal's live preview
 * runs the same code as the route. The writes belong to the server-only store
 * (Session 2).
 */

import { addDays } from './calendar-day';
import { eventInstant, isCalendarDay } from './event-schedule';
import { isPayMongoMethod, transactionFeeFor } from './free-checkout';
import { asLogisticsMethod, LOGISTICS_METHODS, type DeliveryZone } from './registration-codes';
import type { RunnerAddress } from './runner-address';
import { offersDelivery } from '@/app/events/[slug]/register/delivery';
import {
  ADDRESS_PART_LABELS,
  addressProblems,
  parseDeliveryAddress,
} from '@/app/events/[slug]/register/delivery-address';
import { checkoutDelivery } from '@/app/events/[slug]/register/delivery-split';

// ── Status vocabulary ────────────────────────────────────────────────────────

export const LOGISTICS_CHANGE_STATUSES = {
  /** A switch to delivery waiting for its fee. Its orders have not moved. */
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  /** Moved: paid, or nothing to pay (back to pickup). */
  APPLIED: 'APPLIED',
  /** Staff withdrew an awaiting switch; the orders stay as they were. */
  CANCELLED: 'CANCELLED',
  /** An awaiting switch ran out of time unpaid (L12); the orders stay pickup. */
  EXPIRED: 'EXPIRED',
} as const;

export type LogisticsChangeStatus =
  (typeof LOGISTICS_CHANGE_STATUSES)[keyof typeof LOGISTICS_CHANGE_STATUSES];

const STATUS_VALUES = Object.values(LOGISTICS_CHANGE_STATUSES) as string[];

/**
 * Narrows a stored or posted value to a status, or null when it is none —
 * not a fallback, for `asCategoryChangeStatus`'s reason: guessing what an
 * unrecognised row means could move an order nobody paid to move.
 */
export function asLogisticsChangeStatus(value: unknown): LogisticsChangeStatus | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return STATUS_VALUES.includes(code) ? (code as LogisticsChangeStatus) : null;
}

/** The one open status (L13): at most one per order. */
export function isOpenSwitch(status: unknown): boolean {
  return asLogisticsChangeStatus(status) === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
}

export const LOGISTICS_CHANGE_STATUS_LABELS: Record<LogisticsChangeStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  APPLIED: 'Switched',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

/** Badge tones, the same three `CATEGORY_CHANGE_STATUS_TONES` uses. */
export const LOGISTICS_CHANGE_STATUS_TONES: Record<
  LogisticsChangeStatus,
  'success' | 'pending' | 'neutral'
> = {
  AWAITING_PAYMENT: 'pending',
  APPLIED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

// ── Direction ────────────────────────────────────────────────────────────────

export const LOGISTICS_DIRECTIONS = {
  TO_DELIVERY: 'TO_DELIVERY',
  TO_PICKUP: 'TO_PICKUP',
} as const;

export type LogisticsDirection = (typeof LOGISTICS_DIRECTIONS)[keyof typeof LOGISTICS_DIRECTIONS];

/** Null on anything else: a switch whose direction is unknown moves nothing. */
export function asLogisticsDirection(value: unknown): LogisticsDirection | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return code === LOGISTICS_DIRECTIONS.TO_DELIVERY || code === LOGISTICS_DIRECTIONS.TO_PICKUP
    ? code
    : null;
}

/** The only switch an order can make: to whichever method it is not on (L2, whole order). */
export function directionFor(logisticsMethod: unknown): LogisticsDirection {
  return asLogisticsMethod(logisticsMethod) === LOGISTICS_METHODS.DELIVERY
    ? LOGISTICS_DIRECTIONS.TO_PICKUP
    : LOGISTICS_DIRECTIONS.TO_DELIVERY;
}

/** "RM-D918005C-L1": the primary order's reference and which switch of its this is. */
export function logisticsChangeRef(orderRef: string, changeNo: number): string {
  return `${orderRef}-L${changeNo}`;
}

// ── When a switch may happen ─────────────────────────────────────────────────

/** Days before race day the default deadline falls (L11): the courier's lead time. */
export const LOGISTICS_CHANGE_LEAD_DAYS = 7;

type DeadlineEvent = { date: string; logisticsChangeUntil?: Date | string | null };

/**
 * The last moment a switch may be made, and when every awaiting one expires
 * (L11, L12). Null on the event means **7 days before race day, 00:00 Manila**,
 * so a parcel still has a week to arrive. For a virtual run `date` is the
 * first day of its window, and the rule holds from there. Null only when the
 * event's day is unreadable, which callers treat as closed.
 */
export function logisticsChangeDeadline(event: DeadlineEvent): Date | null {
  if (event.logisticsChangeUntil) {
    const set = new Date(event.logisticsChangeUntil);
    return Number.isNaN(set.getTime()) ? null : set;
  }
  if (!isCalendarDay(event.date)) return null;
  return eventInstant(addDays(event.date, -LOGISTICS_CHANGE_LEAD_DAYS), '00:00');
}

export type SwitchRefusal =
  | 'ORDER_NOT_PAID'
  | 'OPEN_SWITCH'
  | 'PAST_DEADLINE'
  | 'NO_DELIVERY'
  | 'NO_PICKUP';

export type SwitchEligibility =
  | { allowed: true; direction: LogisticsDirection }
  | { allowed: false; reason: SwitchRefusal; message: string };

type SwitchEvent = DeadlineEvent & {
  logisticsPickup?: boolean | null;
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
};

/**
 * Whether staff may switch this order now, which way, and if not, the one
 * sentence that says why — the row action is offered only when allowed, and
 * the route returns the refusal.
 *
 * First refusal wins, in the order staff can act on: PAID only (L3 — a
 * PENDING transfer is validated or expires first; a complimentary order is
 * PAID and switches like any other), no awaiting switch already (L13 — a
 * category change on the order is independent and not asked about), the
 * deadline (L11), and the event still offering the method switched to.
 */
export function canSwitchLogistics(input: {
  orderStatus: string;
  logisticsMethod: string;
  hasOpenSwitch: boolean;
  event: SwitchEvent;
  now?: Date;
}): SwitchEligibility {
  const refuse = (reason: SwitchRefusal, message: string): SwitchEligibility => ({
    allowed: false,
    reason,
    message,
  });
  if (input.orderStatus.trim().toUpperCase() !== 'PAID') {
    return refuse(
      'ORDER_NOT_PAID',
      'Only a paid order can switch between pickup and delivery. Validate or settle the payment first.',
    );
  }
  if (input.hasOpenSwitch) {
    return refuse(
      'OPEN_SWITCH',
      'This order already has a switch waiting for payment. Cancel it before starting another.',
    );
  }
  const deadline = logisticsChangeDeadline(input.event);
  if (!deadline || (input.now ?? new Date()).getTime() >= deadline.getTime()) {
    return refuse('PAST_DEADLINE', 'Switching between pickup and delivery has closed for this race.');
  }
  const direction = directionFor(input.logisticsMethod);
  if (direction === LOGISTICS_DIRECTIONS.TO_DELIVERY && !offersDelivery(input.event)) {
    return refuse('NO_DELIVERY', 'This race does not offer delivery.');
  }
  if (direction === LOGISTICS_DIRECTIONS.TO_PICKUP && input.event.logisticsPickup === false) {
    return refuse('NO_PICKUP', 'This race does not offer kit pickup.');
  }
  return { allowed: true, direction };
}

// ── The quote ────────────────────────────────────────────────────────────────

type DeliveryEvent = {
  province?: string | null;
  location?: string | null;
  format?: string | null;
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
};

type AddressedLike = Partial<Record<keyof RunnerAddress, unknown>>;

/** The order being switched: one receipt per switch (R3). */
export type SwitchOrder = {
  id: string;
  /** Its live runners' home addresses, resolved, in runner order. */
  runners: readonly AddressedLike[];
};

export type LogisticsQuoteInput = {
  event: DeliveryEvent;
  direction: LogisticsDirection;
  /** Exactly one: the receipt being switched (R3). More is refused, never priced as one parcel. */
  orders: readonly SwitchOrder[];
  /**
   * Where TO_DELIVERY ships: one composed `deliveryAddress` for every kit on
   * the receipt, as one parcel (and the zone staff picked when the event's
   * province is unknown, L5). Shipping each kit to its runner's own home was
   * removed on 2026-10-20. Ignored for TO_PICKUP.
   */
  target?: { deliveryAddress?: string | null; deliveryZone?: unknown };
  /** How the fee will be paid, in the stored form. Null: no transaction fee shown yet. */
  paymentMethod?: string | null;
};

export type QuotedParcel = {
  address: RunnerAddress;
  zone: DeliveryZone | null;
  /** Centavos: the tier this address falls in. */
  tierFee: number;
  /** Centavos: what this parcel adds — its tier, never waived for another order's parcel. */
  fee: number;
  /** Which kits travel in it: an index into `orders`, and the runner's within it. */
  kits: { order: number; runner: number }[];
};

export type LogisticsQuoteRefusal = 'NO_ORDERS' | 'MANY_ORDERS' | 'ADDRESS_INCOMPLETE' | 'NOT_DELIVERABLE';

export type LogisticsQuote =
  | { ok: false; reason: LogisticsQuoteRefusal; message: string }
  | {
      ok: true;
      direction: LogisticsDirection;
      /** The target as the orders will store it; null for TO_PICKUP. `deliverySplit` is always false now. */
      deliveryZone: DeliveryZone | null;
      deliveryAddress: string | null;
      deliverySplit: boolean;
      parcels: QuotedParcel[];
      /** Centavos: the sum of the parcels' fees. */
      fee: number;
      transactionFee: number;
      /** fee + transactionFee when there is a fee; else 0. */
      totalCharged: number;
      status: LogisticsChangeStatus;
    };

function addressOf(deliveryAddress: string | null | undefined): RunnerAddress {
  const parts = parseDeliveryAddress(deliveryAddress);
  return {
    addressProvince: parts.province,
    addressCity: parts.city,
    addressBarangay: parts.barangay,
    addressStreet: parts.street,
  };
}

/** The whole quote for one switch (L5, L7, L9, and the per-order fee). */
export function quoteLogisticsChange(input: LogisticsQuoteInput): LogisticsQuote {
  if (input.orders.length === 0) {
    return { ok: false, reason: 'NO_ORDERS', message: 'Choose the order to switch.' };
  }
  // One receipt, one fee: two orders are never quoted as one parcel.
  if (input.orders.length > 1) {
    return { ok: false, reason: 'MANY_ORDERS', message: 'Switch one order at a time: each pays its own delivery fee.' };
  }

  // L9: back to pickup is free, applies at once and gives nothing back.
  if (input.direction === LOGISTICS_DIRECTIONS.TO_PICKUP) {
    return {
      ok: true,
      direction: input.direction,
      deliveryZone: null,
      deliveryAddress: null,
      deliverySplit: false,
      parcels: [],
      fee: 0,
      transactionFee: 0,
      totalCharged: 0,
      status: LOGISTICS_CHANGE_STATUSES.APPLIED,
    };
  }

  // Every kit on the receipt, remembered back to its runner.
  const kits = input.orders.flatMap((order, o) => order.runners.map((_, r) => ({ order: o, runner: r })));
  const target = input.target ?? {};

  const problems = addressProblems(parseDeliveryAddress(target.deliveryAddress));
  const part = (Object.keys(problems) as (keyof typeof problems)[])[0];
  if (part) {
    return {
      ok: false,
      reason: 'ADDRESS_INCOMPLETE',
      message: `Delivery address — ${ADDRESS_PART_LABELS[part]}: ${problems[part]!.toLowerCase()}`,
    };
  }

  // The checkout's own answer: the zone, and the sentence when the event does
  // not deliver there (L5).
  const checked = checkoutDelivery(input.event, {
    logisticsMethod: LOGISTICS_METHODS.DELIVERY,
    deliveryZone: target.deliveryZone,
    deliveryAddress: target.deliveryAddress,
  });
  if ('error' in checked) return { ok: false, reason: 'NOT_DELIVERABLE', message: checked.error };

  // Every kit on the receipt in one parcel.
  const parcels: QuotedParcel[] = [
    {
      address: addressOf(target.deliveryAddress),
      zone: checked.zone,
      tierFee: checked.fee,
      fee: checked.fee,
      kits,
    },
  ];

  const fee = parcels.reduce((sum, parcel) => sum + parcel.fee, 0);
  // On top, exactly as at checkout, and only when PayMongo collects it.
  const transactionFee =
    fee > 0 && isPayMongoMethod(input.paymentMethod ?? null) ? transactionFeeFor(fee, input.paymentMethod) : 0;

  return {
    ok: true,
    direction: input.direction,
    deliveryZone: checked.zone,
    deliveryAddress: target.deliveryAddress ?? null,
    deliverySplit: false,
    parcels,
    fee,
    transactionFee,
    totalCharged: fee > 0 ? fee + transactionFee : 0,
    status: fee > 0 ? LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT : LOGISTICS_CHANGE_STATUSES.APPLIED,
  };
}
