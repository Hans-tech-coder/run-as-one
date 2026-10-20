/**
 * **What switching a paid order between kit pickup and delivery costs, and
 * when it may happen** (LOGISTICS_CHANGE_PLAN.md L3, L5, L6, L9, L11, L13).
 *
 * After paying, runners ask staff by chat to have a pickup kit shipped instead.
 * The order's receipt is never edited (L4): the switch is its own
 * `LogisticsChange` row, and its fee comes from `quoteLogisticsChange` here.
 * One function because the modal that previews the fee and the route that
 * writes it must agree to the centavo.
 *
 * **Shipping is charged per parcel, not per receipt** (L6). Kits going to one
 * address are one parcel and pay one tier, across every order ticked into the
 * switch. A parcel whose address already receives a **PAID** delivery in this
 * event rides on it at ₱0, and the switch records which order it rides on. A
 * delivery only awaiting payment does not count: an awaiting switch never
 * touches its orders, so it is invisible here, and a cancelled or expired one
 * can never leave a free rider behind.
 *
 * **Staff never type a fee** (L5). The tier comes from the address with the
 * checkout's own functions (`checkoutDelivery`, and
 * `groupByAddress` for what counts as one address), so a switch and a
 * checkout to the same address always cost the same. A zone the event does not
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
import { groupByAddress, type RunnerAddress } from './runner-address';
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
  /** Moved: paid, or nothing to pay (a rider, or back to pickup). */
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

/** One order being switched: the primary first, then those ticked in (L6). */
export type SwitchOrder = {
  id: string;
  /** Its live runners' home addresses, resolved, in runner order. */
  runners: readonly AddressedLike[];
};

/**
 * One of the event's orders as a possible parcel to ride on. Pass the event's
 * delivery orders; only a PAID one on DELIVERY counts, which the quote checks
 * itself so a caller's wider query can never create a free rider.
 */
export type ExistingDelivery = {
  registrationId: string;
  status: string;
  logisticsMethod: string;
  deliveryAddress: string | null;
  deliverySplit: boolean;
  /** Its runners' home addresses, read only when it ships split. */
  runners: readonly AddressedLike[];
};

export type LogisticsQuoteInput = {
  event: DeliveryEvent;
  direction: LogisticsDirection;
  orders: readonly SwitchOrder[];
  /**
   * Where TO_DELIVERY ships: one composed `deliveryAddress` for every kit on
   * the receipt, as one parcel (and the zone staff picked when the event's
   * province is unknown, L5). Shipping each kit to its runner's own home was
   * removed on 2026-10-20. Ignored for TO_PICKUP.
   */
  target?: { deliveryAddress?: string | null; deliveryZone?: unknown };
  existing: readonly ExistingDelivery[];
  /** How the fee will be paid, in the stored form. Null: no transaction fee shown yet. */
  paymentMethod?: string | null;
};

export type QuotedParcel = {
  address: RunnerAddress;
  zone: DeliveryZone | null;
  /** Centavos: the tier this address falls in. */
  tierFee: number;
  /** Centavos: what this parcel adds — 0 when it rides on a paid one. */
  fee: number;
  ridesOnRegistrationId: string | null;
  /** Which kits travel in it: an index into `orders`, and the runner's within it. */
  kits: { order: number; runner: number }[];
};

export type LogisticsQuoteRefusal = 'NO_ORDERS' | 'ADDRESS_INCOMPLETE' | 'NOT_DELIVERABLE';

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
      /**
       * The first parcel's ride, for `LogisticsChange.ridesOnRegistrationId`.
       * One parcel per switch, so it is that parcel's.
       */
      ridesOnRegistrationId: string | null;
      /** Centavos: the sum of the parcels' fees (L6). */
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

/**
 * Every parcel the event already ships on a PAID order, one per distinct
 * address — a split order's households, or a one-address order's address.
 * The orders being switched are left out: they cannot ride on themselves.
 */
export function paidParcels(
  existing: readonly ExistingDelivery[],
  exclude: ReadonlySet<string> = new Set(),
): { registrationId: string; address: RunnerAddress }[] {
  return existing.flatMap(order => {
    if (exclude.has(order.registrationId)) return [];
    if (order.status.trim().toUpperCase() !== 'PAID') return [];
    if (asLogisticsMethod(order.logisticsMethod) !== LOGISTICS_METHODS.DELIVERY) return [];
    const addresses = order.deliverySplit
      ? groupByAddress(order.runners).map(group => group.address)
      : [addressOf(order.deliveryAddress)];
    return addresses.map(address => ({ registrationId: order.registrationId, address }));
  });
}

/** The whole quote for one switch (L5, L6, L7, L9). */
export function quoteLogisticsChange(input: LogisticsQuoteInput): LogisticsQuote {
  if (input.orders.length === 0) {
    return { ok: false, reason: 'NO_ORDERS', message: 'Choose the order to switch.' };
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
      ridesOnRegistrationId: null,
      fee: 0,
      transactionFee: 0,
      totalCharged: 0,
      status: LOGISTICS_CHANGE_STATUSES.APPLIED,
    };
  }

  // Every kit across the ticked orders, remembered back to its order.
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
      ridesOnRegistrationId: null,
      kits,
    },
  ];

  // L6: one grouping over the new parcels and the paid ones, by the same rule
  // an old split order's households are grouped by, so "the same address" means one
  // thing everywhere. A new parcel grouped with a paid one rides on it.
  const paid = paidParcels(input.existing, new Set(input.orders.map(order => order.id)));
  for (const group of groupByAddress([...parcels.map(p => p.address), ...paid.map(p => p.address)])) {
    const host = group.runners.find(index => index >= parcels.length);
    if (host === undefined) continue;
    for (const index of group.runners) {
      if (index >= parcels.length) continue;
      parcels[index].ridesOnRegistrationId = paid[host - parcels.length].registrationId;
      parcels[index].fee = 0;
    }
  }

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
    ridesOnRegistrationId: parcels.find(parcel => parcel.ridesOnRegistrationId)?.ridesOnRegistrationId ?? null,
    fee,
    transactionFee,
    totalCharged: fee > 0 ? fee + transactionFee : 0,
    status: fee > 0 ? LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT : LOGISTICS_CHANGE_STATUSES.APPLIED,
  };
}
