import 'server-only';
import { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { lockEventRow } from '@/lib/registration-gate';
import {
  LOGISTICS_CHANGE_STATUSES,
  canSwitchLogistics,
  directionFor,
  type LogisticsDirection,
  type SwitchEligibility,
  type SwitchOrder,
} from '@/lib/logistics-change';

/**
 * **What a delivery switch is decided from, and the locks every switch write
 * takes** (LOGISTICS_CHANGE_PLAN.md L3, L11, L13, Revision 1 R3).
 *
 * `readSwitchContext` is the one read every write in
 * `logistics-change-store.ts` and the runner's link (`logistics-change-runner.ts`)
 * makes, for one receipt (R3): the order, its event, and whether this order
 * already has a switch waiting (L13). **It reads no other order** (the owner,
 * 2026-10-21: a delivery fee is charged per order, so another order's parcel,
 * paid or waiting, never changes what this one costs or whether it may
 * switch; this replaced L6, R4 and R5). The store reads it inside its
 * transaction after `lockSwitch`, so what it writes is decided from what is
 * locked. The registrants screen reads the same facts for every receipt at
 * once (`logistics-receipts.ts`).
 *
 * **The locks, in one order**: the event row `FOR SHARE` (`lockEventRow`, as a
 * category change takes it, so a paused race still lets staff switch), then a
 * transaction advisory lock on the event's switches, then each order
 * `FOR UPDATE` in id order. The advisory lock is held only by switch writes,
 * so checkout never waits on it; it keeps an event's switch writes one at a
 * time, which costs little and leaves room for a rule that reads across
 * receipts again.
 *
 * Kept apart from the store, which owns the writes, as `category-change-context.ts`
 * is. Server-only.
 */

/** Thrown with the sentence staff should read and the status the route answers with. */
export class LogisticsChangeRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LogisticsChangeRefused';
  }
}

export const SWITCH_EVENT_SELECT = {
  id: true,
  title: true,
  organizerId: true,
  date: true,
  resultsOnly: true,
  province: true,
  location: true,
  format: true,
  logisticsPickup: true,
  logisticsDeliveryFeeInside: true,
  logisticsDeliveryFeeOutside: true,
  logisticsChangeUntil: true,
} as const;

const ORDER_SELECT = {
  id: true,
  orderRef: true,
  status: true,
  eventId: true,
  paymentMethod: true,
  logisticsMethod: true,
  deliveryZone: true,
  deliveryAddress: true,
  deliverySplit: true,
  runners: {
    where: { deletedAt: null },
    orderBy: { runnerNo: 'asc' },
    select: {
      id: true,
      runnerNo: true,
      firstName: true,
      lastName: true,
      addressStreet: true,
      addressBarangay: true,
      addressCity: true,
      addressProvince: true,
    },
  },
} satisfies Prisma.RegistrationSelect;

type Client = Prisma.TransactionClient | typeof db;
export type SwitchEvent = Prisma.EventGetPayload<{ select: typeof SWITCH_EVENT_SELECT }>;
export type SwitchOrderRow = Prisma.RegistrationGetPayload<{ select: typeof ORDER_SELECT }>;

/** An order as the quote reads it: its id and its runners' home addresses. */
export function asSwitchOrder(order: SwitchOrderRow): SwitchOrder {
  return { id: order.id, runners: order.runners };
}

/**
 * The event's lock, the switches' lock, then each order in id order — the
 * one order every switch write takes them in, so two never deadlock.
 */
export async function lockSwitch(tx: Prisma.TransactionClient, eventId: string, registrationIds: readonly string[]) {
  const event = await lockEventRow(tx, eventId);
  if (!event) throw new LogisticsChangeRefused(404, 'Order not found');
  // $executeRaw: the lock function returns void, which a query cannot read back.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`logistics-change:${eventId}`}, 0))`);
  for (const id of [...new Set(registrationIds)].sort()) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Registration" WHERE "id" = ${id} FOR UPDATE`);
  }
}

/** Whether staff may switch this order now (L3, L11, L13), and a results-only race never. */
export function eligibilityFor(
  event: SwitchEvent,
  order: { status: string; logisticsMethod: string },
  hasOpenSwitch: boolean,
  now = new Date(),
): SwitchEligibility {
  if (event.resultsOnly) {
    return {
      allowed: false,
      reason: 'PAST_DEADLINE',
      message: 'This race only shows results, so its orders cannot switch between pickup and delivery.',
    };
  }
  return canSwitchLogistics({
    orderStatus: order.status,
    logisticsMethod: order.logisticsMethod,
    hasOpenSwitch,
    event,
    now,
  });
}

/** Everything one switch is decided from. `client` is the transaction inside a write. */
export async function readSwitchContext(client: Client, registrationId: string, now = new Date()) {
  const order = await client.registration.findUnique({ where: { id: registrationId }, select: ORDER_SELECT });
  if (!order) throw new LogisticsChangeRefused(404, 'Order not found');
  const event = await client.event.findUniqueOrThrow({ where: { id: order.eventId }, select: SWITCH_EVENT_SELECT });
  const direction: LogisticsDirection = directionFor(order.logisticsMethod);

  // This order's own switches only: L13, and the next reference.
  const [openCount, linkCount] = await Promise.all([
    client.logisticsChangeOrder.count({
      where: { registrationId: order.id, change: { status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT } },
    }),
    client.logisticsChangeOrder.count({ where: { registrationId: order.id } }),
  ]);
  const hasOpenSwitch = openCount > 0;

  return {
    event,
    order,
    direction,
    eligibility: eligibilityFor(event, order, hasOpenSwitch, now),
    /** Which switch of the order's this is, for its reference. */
    changeNo: linkCount + 1,
  };
}

export type SwitchContext = Awaited<ReturnType<typeof readSwitchContext>>;

/** Who may act on an order: the route checks `can()` against it before anything else. */
export async function findOrderReach(registrationId: string) {
  const order = await db.registration.findUnique({
    where: { id: registrationId },
    select: { eventId: true, event: { select: { organizerId: true } } },
  });
  return order ? { organizerId: order.event.organizerId, eventId: order.eventId } : null;
}

/** Who may act on a switch: the route checks `can()` against it before anything else. */
export async function findSwitchReach(changeId: string) {
  const change = await db.logisticsChange.findUnique({
    where: { id: changeId },
    select: { eventId: true, event: { select: { organizerId: true } } },
  });
  return change ? { organizerId: change.event.organizerId, eventId: change.eventId } : null;
}
