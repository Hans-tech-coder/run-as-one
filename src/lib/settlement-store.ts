/**
 * Reading settlements out of the database (ADMIN_MERGE_PLAN.md, Batch 6).
 *
 * Apart from `settlement.ts` for the reason `promo-store.ts` is apart from
 * `discount.ts`: the rule is imported by the record dialog and must not drag
 * Prisma into the browser bundle.
 *
 * **Nothing about what is owed is stored.** Every figure is summed from the
 * PAID registrations at request time, so a payment validated a minute ago or
 * an order refunded after a payout is already in the balance, with no job to
 * keep a stored total in step. The list is two grouped queries for the whole
 * screen, not two per race.
 *
 * Every read is scoped to the actor's tenant and asks `remittance:manage`, so
 * a per-event staff member or a client viewer reaches nothing here whatever
 * id is in the URL.
 */

import prisma from './db';
import { can, reachableEvents, type Actor } from './actor';
import { mostRecentFirst } from './event-schedule';
import { NO_ORDERS, settle, type OrderTotals, type Settlement } from './settlement';

export type EventSettlementRow = {
  id: string;
  title: string;
  date: string;
  clientName: string | null;
  settlement: Settlement;
};

/** Order totals and net remitted per event, for the given events only. */
async function totalsByEvent(eventIds: string[]) {
  const [orders, remittances] = await Promise.all([
    prisma.registration.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds }, status: 'PAID' },
      _count: { _all: true },
      _sum: { totalAmount: true, platformFee: true, transactionFee: true },
    }),
    prisma.remittance.groupBy({
      by: ['eventId', 'kind'],
      where: { eventId: { in: eventIds }, status: 'RECORDED' },
      _sum: { amount: true },
    }),
  ]);

  const orderTotals = new Map<string, OrderTotals>(
    orders.map(row => [
      row.eventId,
      {
        paidOrders: row._count._all,
        collected: row._sum.totalAmount ?? 0,
        platformFees: row._sum.platformFee ?? 0,
        transactionFees: row._sum.transactionFee ?? 0,
      },
    ]),
  );

  const remitted = new Map<string, number>();
  for (const row of remittances) {
    const amount = row._sum.amount ?? 0;
    remitted.set(row.eventId, (remitted.get(row.eventId) ?? 0) + (row.kind === 'RETURN' ? -amount : amount));
  }

  return (eventId: string) => settle(orderTotals.get(eventId) ?? NO_ORDERS, remitted.get(eventId) ?? 0);
}

/** Every race this actor may settle, latest race first. */
export async function eventSettlements(actor: Actor): Promise<EventSettlementRow[]> {
  const events = await prisma.event.findMany({
    where: reachableEvents(actor, 'remittance:manage'),
    orderBy: mostRecentFirst,
    select: { id: true, title: true, date: true, client: { select: { name: true } } },
  });
  if (events.length === 0) return [];

  const settlementOf = await totalsByEvent(events.map(event => event.id));
  return events.map(event => ({
    id: event.id,
    title: event.title,
    date: event.date,
    clientName: event.client?.name ?? null,
    settlement: settlementOf(event.id),
  }));
}

/**
 * One race's settlement, its breakdown and its remittances — or null when the
 * race does not exist or this actor may not settle it, answered alike so the
 * page cannot be used to probe which ids exist.
 */
export async function eventSettlement(actor: Actor, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId: actor.orgId },
    select: {
      id: true,
      title: true,
      date: true,
      organizerId: true,
      client: { select: { name: true } },
    },
  });
  if (!event || !can(actor, 'remittance:manage', { organizerId: event.organizerId, eventId: event.id })) {
    return null;
  }

  const [settlementOf, parts, remittances] = await Promise.all([
    totalsByEvent([event.id]),
    // What the organizer's share is made of, for the breakdown panel. The
    // balance never reads these; they only explain it.
    prisma.registration.aggregate({
      where: { eventId: event.id, status: 'PAID' },
      _sum: { subtotal: true, discountAmount: true, deliveryFee: true },
    }),
    prisma.remittance.findMany({
      where: { eventId: event.id },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  return {
    event: { id: event.id, title: event.title, date: event.date, clientName: event.client?.name ?? null },
    settlement: settlementOf(event.id),
    parts: {
      entries: parts._sum.subtotal ?? 0,
      discounts: parts._sum.discountAmount ?? 0,
      delivery: parts._sum.deliveryFee ?? 0,
    },
    remittances: remittances.map(row => ({
      id: row.id,
      kind: row.kind,
      amount: row.amount,
      paidOn: row.paidOn,
      method: row.method,
      reference: row.reference,
      note: row.note,
      hasProof: Boolean(row.proof),
      status: row.status,
      recordedByName: row.recordedByName,
      createdAt: row.createdAt.toISOString(),
      voidedAt: row.voidedAt?.toISOString() ?? null,
      voidedByName: row.voidedByName,
      voidReason: row.voidReason,
    })),
  };
}

export type EventSettlementDetail = NonNullable<Awaited<ReturnType<typeof eventSettlement>>>;
export type RemittanceRow = EventSettlementDetail['remittances'][number];
