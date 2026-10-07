/**
 * What a client viewer is shown about one of its races, on that race's own
 * page (CLIENT_RACE_PAGE_PLAN.md, Batch 1): how full each category is, the
 * shirt sizes to order, and how the race kits go out.
 *
 * **Still counts and nothing else**, the rule `client-summary.ts` exists to
 * force. A size is a count of runners per size; a kit is a count of runners
 * per pickup or delivery. No name, contact, address, amount or order
 * reference leaves a query here, and the shapes returned have no field to
 * carry one.
 *
 * **The header and the category counts are `viewerEventSummaries`'**, narrowed
 * to the one race, so the page and the card it was opened from are the same
 * read and cannot disagree. A race the actor may not see — another client's,
 * a removed one, an id that is not a race — is `null`, and the page answers
 * every such id with the same 404.
 *
 * **Who is counted** is the registrants rule the rest of the client view uses:
 * a runner on a PAID order or on a bank transfer awaiting verification
 * (`awaitingVerificationWhere`), never a removed runner or one on a removed
 * order. An unpaid checkout is not a registrant (UNPAID_ORDERS_PLAN.md), so it
 * orders no shirt and ships no kit here.
 *
 * Server-only.
 */

import prisma from './db';
import type { Prisma } from '@prisma/client';
import type { Actor } from './actor';
import { viewerEventSummaries, type ViewerEventSummary } from './client-summary';
import { awaitingVerificationWhere } from './pending-expiry';
import { pickupDetails } from './pickup';
import { asDeliveryZone, asLogisticsMethod, deliveryZoneLabelFor, LOGISTICS_METHODS } from './registration-codes';
import { SHIRT_SIZES } from './shirt-size';

/** One shirt size: registrants wearing it, per category id and in all. */
export type SizeRow = { size: string; byCategory: Record<string, number>; total: number };

export type KitSplit = {
  pickup: number;
  /** Delivered kits, split by zone where the race asked; otherwise one row. */
  delivery: { label: string; count: number }[];
  /** Where and when pickup happens, as the runners were told, or that nobody has said. */
  pickupWhere: string;
};

export type ViewerRaceReport = {
  event: ViewerEventSummary;
  /** Sizes in chart order, then any size a runner typed that the chart lacks. */
  sizes: SizeRow[];
  /** Per category id, how many registrants have a shirt size at all. */
  sizedByCategory: Record<string, number>;
  kits: KitSplit;
};

/** The registrants: paid, or a bank transfer awaiting verification. */
function registrantOrders(): Prisma.RegistrationWhereInput {
  return { deletedAt: null, OR: [{ status: 'PAID' }, awaitingVerificationWhere()] };
}

export async function viewerRaceReport(actor: Actor, eventId: string): Promise<ViewerRaceReport | null> {
  const [event] = await viewerEventSummaries(actor, eventId);
  if (!event) return null;

  const [sizeGroups, orders, logistics] = await Promise.all([
    prisma.runner.groupBy({
      by: ['categoryId', 'singletSize'],
      where: { deletedAt: null, category: { eventId }, registration: registrantOrders() },
      _count: { _all: true },
    }),
    prisma.registration.findMany({
      where: { eventId, ...registrantOrders() },
      select: {
        logisticsMethod: true,
        deliveryZone: true,
        _count: { select: { runners: { where: { deletedAt: null } } } },
      },
    }),
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        pickupLocation: true,
        pickupSchedule: true,
        logisticsDeliveryFeeInside: true,
        logisticsDeliveryFeeOutside: true,
      },
    }),
  ]);

  return {
    event,
    ...sizeTable(sizeGroups),
    kits: kitSplit(orders, logistics),
  };
}

function sizeTable(groups: { categoryId: string; singletSize: string; _count: { _all: number } }[]) {
  const rows = new Map<string, SizeRow>();
  const sizedByCategory: Record<string, number> = {};
  for (const group of groups) {
    // Blank is a package with nothing to wear (`storedShirtSize`), not a size.
    const size = chartSize(group.singletSize);
    if (!size) continue;
    const row = rows.get(size) ?? { size, byCategory: {}, total: 0 };
    row.byCategory[group.categoryId] = (row.byCategory[group.categoryId] ?? 0) + group._count._all;
    row.total += group._count._all;
    rows.set(size, row);
    sizedByCategory[group.categoryId] = (sizedByCategory[group.categoryId] ?? 0) + group._count._all;
  }

  // The chart's order, which is the order a supplier's order form is in; a
  // size the chart does not list (a 5XL, a supplier's own code) goes after.
  const rank = (size: string) => {
    const at = SHIRT_SIZES.indexOf(size);
    return at === -1 ? SHIRT_SIZES.length : at;
  };
  const sizes = [...rows.values()].sort(
    (a, b) => rank(a.size) - rank(b.size) || a.size.localeCompare(b.size),
  );
  return { sizes, sizedByCategory };
}

/**
 * Older orders stored a size as the runner typed it — "Large", "medium",
 * "XXL" — before the picker offered the chart's codes. Counted apart, an
 * organizer reads 52 L and 2 LARGE and orders two shirts short of the truth,
 * so the spelled-out names are folded into the code they mean. Only for the
 * count: the stored value is the runner's and is left as it is.
 */
const SIZE_ALIASES: Record<string, string> = {
  'EXTRA SMALL': 'XS',
  SMALL: 'S',
  MEDIUM: 'M',
  LARGE: 'L',
  'EXTRA LARGE': 'XL',
  XXS: '2XS',
  XXL: '2XL',
  XXXL: '3XL',
  XXXXL: '4XL',
};

function chartSize(stored: string): string {
  const size = stored.trim().toUpperCase().replace(/[\s_-]+/g, ' ');
  return SIZE_ALIASES[size] ?? size;
}

function kitSplit(
  orders: { logisticsMethod: string; deliveryZone: string | null; _count: { runners: number } }[],
  event: {
    pickupLocation: string | null;
    pickupSchedule: string | null;
    logisticsDeliveryFeeInside: number;
    logisticsDeliveryFeeOutside: number;
  },
): KitSplit {
  let pickup = 0;
  const delivery = new Map<string, number>();
  for (const order of orders) {
    // A kit per runner, so an order of three going out by courier is three kits.
    const kits = order._count.runners;
    if (asLogisticsMethod(order.logisticsMethod) === LOGISTICS_METHODS.PICKUP) {
      pickup += kits;
      continue;
    }
    // Only where the race actually asked the runner which zone: otherwise the
    // stored zone is a default and naming it would misstate where kits go.
    const label = (asDeliveryZone(order.deliveryZone) && deliveryZoneLabelFor(event, order.deliveryZone)) || 'Delivery';
    delivery.set(label, (delivery.get(label) ?? 0) + kits);
  }
  return {
    pickup,
    delivery: [...delivery].map(([label, count]) => ({ label, count })),
    pickupWhere: pickupWhere(event),
  };
}

/**
 * The pickup line as the organizer should read it. `pickupSummary`'s fallback
 * is written to a runner ("The organizer will confirm…"), which is the wrong
 * voice on the organizer's own page; here a missing place says so.
 */
function pickupWhere(event: { pickupLocation: string | null; pickupSchedule: string | null }): string {
  const { location, schedule } = pickupDetails(event);
  if (location && schedule) return `${location} — ${schedule}`;
  return location ?? schedule ?? 'No pickup place or schedule set yet. Ask Run As One to add it.';
}
