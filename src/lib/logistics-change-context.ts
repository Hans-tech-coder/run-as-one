import 'server-only';
import { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { lockEventRow } from '@/lib/registration-gate';
import { LOGISTICS_METHODS } from '@/lib/registration-codes';
import {
  LOGISTICS_CHANGE_STATUSES,
  LOGISTICS_DIRECTIONS,
  canSwitchLogistics,
  directionFor,
  type ExistingDelivery,
  type LogisticsDirection,
  type SwitchEligibility,
  type SwitchOrder,
} from '@/lib/logistics-change';
import { ridersOf as ridersAmong, type WaitingSwitch } from '@/lib/logistics-change-parcels';

/**
 * **What a delivery switch is decided from, and the locks every switch write
 * takes** (LOGISTICS_CHANGE_PLAN.md L3, L6, L11, L13, Revision 1 R3–R5).
 *
 * `readSwitchContext` is the one read every write in
 * `logistics-change-store.ts` makes, for one receipt (R3): the order, its
 * event, the orders riding on its parcel that must go back to pickup first
 * (R5), the event's paid deliveries the quote looks for a parcel to ride on
 * (L6), the event's switches still waiting for payment and where each would
 * ship (R4), and whether this order already has one waiting (L13). The store
 * reads it inside its transaction after `lockSwitch`, so what it writes is
 * decided from what is locked. The Pickup & Delivery screen reads the same facts
 * for every receipt at once (`logistics-receipts.ts`) and applies the same
 * pure rules (`logistics-change-parcels.ts`).
 *
 * **The locks, in one order**: the event row `FOR SHARE` (`lockEventRow`, as a
 * category change takes it, so a paused race still lets staff switch), then a
 * transaction advisory lock on the event's switches, then each order
 * `FOR UPDATE` in id order. The advisory lock is what makes L6, R4 and R5 hold
 * under concurrency: a switch riding on a parcel and a reverse of that parcel
 * read each other's orders, not their own, and so do two receipts switching
 * to one address, so locking only the order being moved would let both commit
 * — a free rider on a pickup order, or two fees waiting for one parcel. It is
 * held only by switch writes, so checkout never waits on it.
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

/** A live runner's home address, in runner order: what a parcel is grouped by. */
export const RUNNER_ADDRESS_SELECT = {
  where: { deletedAt: null },
  orderBy: { runnerNo: 'asc' },
  select: { addressStreet: true, addressBarangay: true, addressCity: true, addressProvince: true },
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

/** The orders riding at ₱0 on `hosts`' parcels (R5), read from the event's applied switches. */
async function ridersOf(client: Client, eventId: string, hosts: readonly string[]): Promise<string[]> {
  const links = await client.logisticsChangeOrder.findMany({
    where: { change: { eventId, status: LOGISTICS_CHANGE_STATUSES.APPLIED } },
    select: {
      registrationId: true,
      registration: { select: { status: true, logisticsMethod: true } },
      change: { select: { direction: true, ridesOnRegistrationId: true, appliedAt: true, createdAt: true } },
    },
  });
  return ridersAmong(
    links.map(link => ({
      registrationId: link.registrationId,
      status: link.registration.status,
      logisticsMethod: link.registration.logisticsMethod,
      direction: link.change.direction,
      ridesOnRegistrationId: link.change.ridesOnRegistrationId,
      at: (link.change.appliedAt ?? link.change.createdAt).getTime(),
    })),
    hosts,
  );
}

/** The event's switches still waiting for a fee, and where each would ship (R4). */
async function waitingSwitches(client: Client, eventId: string): Promise<WaitingSwitch[]> {
  const rows = await client.logisticsChange.findMany({
    where: { eventId, status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT },
    orderBy: { createdAt: 'asc' },
    select: {
      deliveryAddress: true,
      deliverySplit: true,
      orders: { select: { registration: { select: { id: true, orderRef: true, runners: RUNNER_ADDRESS_SELECT } } } },
    },
  });
  return rows.map(row => ({
    orderRef: row.orders[0]?.registration.orderRef ?? '',
    registrationIds: row.orders.map(link => link.registration.id),
    deliveryAddress: row.deliveryAddress,
    deliverySplit: row.deliverySplit,
    runners: row.orders.flatMap(link => link.registration.runners),
  }));
}

/** Everything one switch is decided from. `client` is the transaction inside a write. */
export async function readSwitchContext(client: Client, registrationId: string, now = new Date()) {
  const order = await client.registration.findUnique({ where: { id: registrationId }, select: ORDER_SELECT });
  if (!order) throw new LogisticsChangeRefused(404, 'Order not found');
  const event = await client.event.findUniqueOrThrow({ where: { id: order.eventId }, select: SWITCH_EVENT_SELECT });
  const direction: LogisticsDirection = directionFor(order.logisticsMethod);

  const [paidDeliveries, riderIds, waiting, linkCount] = await Promise.all([
    // L6: the parcels already paid for. The quote keeps only PAID deliveries
    // itself; asking for them here keeps the read small.
    client.registration.findMany({
      where: { eventId: event.id, status: 'PAID', logisticsMethod: LOGISTICS_METHODS.DELIVERY },
      select: ORDER_SELECT,
    }),
    // R5: who rides on this order's parcel, and must go back first.
    direction === LOGISTICS_DIRECTIONS.TO_PICKUP ? ridersOf(client, event.id, [order.id]) : Promise.resolve([]),
    // R4, and L13 for this order.
    waitingSwitches(client, event.id),
    client.logisticsChangeOrder.count({ where: { registrationId: order.id } }),
  ]);

  const riders = riderIds.length
    ? await client.registration.findMany({
        where: { id: { in: riderIds } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, orderRef: true },
      })
    : [];

  // With its reference, so the store can say which order a parcel ships with.
  const existing: (ExistingDelivery & { orderRef: string })[] = paidDeliveries.map(paid => ({
    registrationId: paid.id,
    orderRef: paid.orderRef,
    status: paid.status,
    logisticsMethod: paid.logisticsMethod,
    deliveryAddress: paid.deliveryAddress,
    deliverySplit: paid.deliverySplit,
    runners: paid.runners,
  }));
  const hasOpenSwitch = waiting.some(change => change.registrationIds.includes(order.id));

  return {
    event,
    order,
    direction,
    eligibility: eligibilityFor(event, order, hasOpenSwitch, now),
    riders,
    existing,
    waiting,
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
