import 'server-only';
import { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { lockEventRow } from '@/lib/registration-gate';
import { paymentChoicesForOrder, CHANGE_PAYMENT_CHOICES } from '@/lib/category-change-hold';
import { LOGISTICS_METHODS, asLogisticsMethod } from '@/lib/registration-codes';
import {
  LOGISTICS_CHANGE_STATUSES,
  LOGISTICS_DIRECTIONS,
  canSwitchLogistics,
  directionFor,
  logisticsChangeDeadline,
  type ExistingDelivery,
  type LogisticsDirection,
  type SwitchEligibility,
  type SwitchOrder,
} from '@/lib/logistics-change';

/**
 * **What a delivery switch is decided from, and the locks every switch write
 * takes** (LOGISTICS_CHANGE_PLAN.md L3, L6, L10, L11, L13; Session 2).
 *
 * `readSwitchContext` is the one read the modal's preview and every write in
 * `logistics-change-store.ts` make: the order, its event, the other PAID
 * pickup orders under the same customer email that can join the switch (L6),
 * the orders riding on this one's parcel that must go back with it (L10), the
 * event's paid deliveries the quote looks for a parcel to ride on, and which
 * orders already have a switch waiting (L13). The store reads it inside its
 * transaction after `lockSwitch`, so what it writes is decided from what is
 * locked.
 *
 * **The locks, in one order**: the event row `FOR SHARE` (`lockEventRow`, as a
 * category change takes it, so a paused race still lets staff switch), then a
 * transaction advisory lock on the event's switches, then each order
 * `FOR UPDATE` in id order. The advisory lock is what makes L6 and L10 hold
 * under concurrency: a switch riding on a parcel and a reverse of that parcel
 * read each other's orders, not their own, so locking only the orders being
 * moved would let both commit and leave a free rider on a pickup order. It is
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

const EVENT_SELECT = {
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
  customerEmail: true,
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
export type SwitchEvent = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;
export type SwitchOrderRow = Prisma.RegistrationGetPayload<{ select: typeof ORDER_SELECT }>;

/** The customer behind an order: the email the receipt went to. */
function contactEmail(order: SwitchOrderRow): string {
  return order.customerEmail.trim().toLowerCase();
}

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
  order: Pick<SwitchOrderRow, 'status' | 'logisticsMethod'>,
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

/**
 * The orders riding at ₱0 on any of `hosts`' parcels (L6), and on theirs in
 * turn, that are not among `hosts` — what L10 says must go back to pickup with
 * them. An order rides on whatever its latest applied switch recorded, as long
 * as it is still a PAID delivery; one that has since gone back to pickup, or
 * paid its own switch, rides on nothing.
 */
async function ridersOf(client: Client, eventId: string, hosts: readonly string[]): Promise<string[]> {
  const links = await client.logisticsChangeOrder.findMany({
    where: { change: { eventId, status: LOGISTICS_CHANGE_STATUSES.APPLIED } },
    select: {
      registrationId: true,
      registration: { select: { status: true, logisticsMethod: true } },
      change: { select: { direction: true, ridesOnRegistrationId: true, appliedAt: true, createdAt: true } },
    },
  });
  const latest = new Map<string, (typeof links)[number]>();
  const at = (link: (typeof links)[number]) => (link.change.appliedAt ?? link.change.createdAt).getTime();
  for (const link of links) {
    const seen = latest.get(link.registrationId);
    if (!seen || at(link) > at(seen)) latest.set(link.registrationId, link);
  }
  const rides = [...latest.values()].filter(
    link =>
      link.change.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY &&
      link.change.ridesOnRegistrationId &&
      link.registration.status === 'PAID' &&
      asLogisticsMethod(link.registration.logisticsMethod) === LOGISTICS_METHODS.DELIVERY,
  );
  const group = new Set(hosts);
  const riders: string[] = [];
  for (let grew = true; grew; ) {
    grew = false;
    for (const link of rides) {
      if (group.has(link.registrationId) || !group.has(link.change.ridesOnRegistrationId!)) continue;
      group.add(link.registrationId);
      riders.push(link.registrationId);
      grew = true;
    }
  }
  return riders;
}

/** Everything one switch is decided from. `client` is the transaction inside a write. */
export async function readSwitchContext(client: Client, registrationId: string, now = new Date()) {
  const order = await client.registration.findUnique({ where: { id: registrationId }, select: ORDER_SELECT });
  if (!order) throw new LogisticsChangeRefused(404, 'Order not found');
  const event = await client.event.findUniqueOrThrow({ where: { id: order.eventId }, select: EVENT_SELECT });
  const direction: LogisticsDirection = directionFor(order.logisticsMethod);
  const email = contactEmail(order);

  const [paidDeliveries, sameEmail, riderIds, linkCount] = await Promise.all([
    // L6: the parcels already paid for. The quote keeps only PAID deliveries
    // itself; asking for them here keeps the read small.
    client.registration.findMany({
      where: { eventId: event.id, status: 'PAID', logisticsMethod: LOGISTICS_METHODS.DELIVERY },
      select: ORDER_SELECT,
    }),
    // L6: the customer's other paid pickup orders, which can join a switch to delivery.
    direction === LOGISTICS_DIRECTIONS.TO_DELIVERY && email
      ? client.registration.findMany({
          where: {
            eventId: event.id,
            id: { not: order.id },
            status: 'PAID',
            logisticsMethod: LOGISTICS_METHODS.PICKUP,
            customerEmail: { equals: email, mode: 'insensitive' },
          },
          orderBy: { createdAt: 'asc' },
          select: ORDER_SELECT,
        })
      : Promise.resolve([]),
    // L10: who rides on this order's parcel, and must go back with it.
    direction === LOGISTICS_DIRECTIONS.TO_PICKUP ? ridersOf(client, event.id, [order.id]) : Promise.resolve([]),
    client.logisticsChangeOrder.count({ where: { registrationId: order.id } }),
  ]);

  const riders = riderIds.length
    ? await client.registration.findMany({ where: { id: { in: riderIds } }, select: ORDER_SELECT })
    : [];
  // Stored as typed at checkout; compared trimmed and in any case.
  const candidates = sameEmail.filter(other => contactEmail(other) === email);

  const involved = [order, ...candidates, ...riders].map(o => o.id);
  const open = await client.logisticsChangeOrder.findMany({
    where: { registrationId: { in: involved }, change: { status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT } },
    select: { registrationId: true },
  });
  const openIds = new Set(open.map(link => link.registrationId));

  // With its reference, so the modal can say which order a parcel ships with.
  const existing: (ExistingDelivery & { orderRef: string })[] = paidDeliveries.map(paid => ({
    registrationId: paid.id,
    orderRef: paid.orderRef,
    status: paid.status,
    logisticsMethod: paid.logisticsMethod,
    deliveryAddress: paid.deliveryAddress,
    deliverySplit: paid.deliverySplit,
    runners: paid.runners,
  }));

  return {
    event,
    order,
    direction,
    eligibility: eligibilityFor(event, order, openIds.has(order.id), now),
    // A candidate with a switch of its own waiting cannot join this one (L13).
    candidates: candidates.filter(other => eligibilityFor(event, other, openIds.has(other.id), now).allowed),
    riders,
    existing,
    /** Which switch of the primary order's this is, for its reference. */
    changeNo: linkCount + 1,
    /** All of a set of orders' riders not in the set: L10's check on the orders actually ticked. */
    ridersOutside: (ids: readonly string[]) => ridersOf(client, event.id, ids),
    hasOpenSwitch: (id: string) => openIds.has(id),
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

/** An order as the modal reads it: its reference, its runners and their home addresses. */
function orderView(order: SwitchOrderRow) {
  return {
    id: order.id,
    orderRef: order.orderRef,
    paymentMethod: order.paymentMethod,
    deliveryAddress: order.deliveryAddress,
    deliverySplit: order.deliverySplit,
    runners: order.runners.map(runner => ({
      name: `${runner.firstName} ${runner.lastName}`,
      addressStreet: runner.addressStreet ?? '',
      addressBarangay: runner.addressBarangay ?? '',
      addressCity: runner.addressCity ?? '',
      addressProvince: runner.addressProvince ?? '',
    })),
  };
}

export type SwitchOrderView = ReturnType<typeof orderView>;

/**
 * The modal's opening read. The fee itself is computed in the browser from
 * these with the same `quoteLogisticsChange` the store writes with. Writes
 * nothing.
 */
export async function previewLogisticsChange(registrationId: string) {
  const ctx = await readSwitchContext(db, registrationId);
  const deadline = logisticsChangeDeadline(ctx.event);
  return {
    eligibility: ctx.eligibility,
    direction: ctx.direction,
    order: orderView(ctx.order),
    candidates: ctx.candidates.map(orderView),
    riders: ctx.riders.map(orderView),
    // The event's paid parcels, for the live quote's ride check (L6). Only
    // their addresses: the screen already lists every runner's.
    existing: ctx.existing.map(paid => ({
      ...paid,
      runners: paid.runners.map(runner => ({
        addressStreet: runner.addressStreet,
        addressBarangay: runner.addressBarangay,
        addressCity: runner.addressCity,
        addressProvince: runner.addressProvince,
      })),
    })),
    event: {
      province: ctx.event.province,
      location: ctx.event.location,
      format: ctx.event.format,
      logisticsDeliveryFeeInside: ctx.event.logisticsDeliveryFeeInside,
      logisticsDeliveryFeeOutside: ctx.event.logisticsDeliveryFeeOutside,
      deadline: deadline ? deadline.toISOString() : null,
    },
    // The way the order was paid (category-change-hold.ts). A payment already
    // made outside the app is recorded in Session 3, so it is not offered yet.
    paymentChoices: paymentChoicesForOrder(ctx.order.paymentMethod).filter(
      choice => choice !== CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID,
    ),
  };
}

export type LogisticsChangePreview = Awaited<ReturnType<typeof previewLogisticsChange>>;
