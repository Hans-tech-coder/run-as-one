/**
 * What a client viewer is shown about one of its races, on that race's own
 * page (CLIENT_RACE_PAGE_PLAN.md, Batches 1–2): how full each category is,
 * the shirt sizes to order, how the race kits go out, and how registrations
 * came in day by day.
 *
 * **Still counts and nothing else**, the rule `client-summary.ts` exists to
 * force. A size is a count of runners per size; a garment is a count of
 * pieces per size; a kit is a count of runners
 * per pickup or delivery; a day is a count of runners whose order was placed
 * on it. No name, contact, address, amount or order
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
 * **Shirts are counted as garments, not runners** (SHIRT_COUNT_PLAN.md). A
 * category's "What's Included" names what it hands out (`wearableItems`): a
 * 10K with a Race Singlet and a Finisher's Shirt orders two pieces per runner,
 * both in the runner's one size, and a 5K with the singlet alone orders one.
 * Each garment is counted once per registrant of every category that includes
 * it. A category whose inclusions are still empty asks a size anyway
 * (`includesWearable`), so its sized runners count under one "not listed"
 * item rather than dropping out of the order.
 *
 * Server-only.
 */

import prisma from './db';
import type { Prisma } from '@prisma/client';
import type { Actor } from './actor';
import { viewerEventSummaries, type ViewerEventSummary } from './client-summary';
import { eventInstantParts, isCalendarDay, today } from './event-schedule';
import { awaitingVerificationWhere } from './pending-expiry';
import { pickupDetails } from './pickup';
import { asDeliveryZone, asLogisticsMethod, deliveryZoneLabelFor, LOGISTICS_METHODS } from './registration-codes';
import { SHIRT_SIZES, wearableItems, type GarmentType } from './shirt-size';

/** One shirt size: registrants wearing it, per category id and in all. */
export type SizeRow = { size: string; byCategory: Record<string, number>; total: number };

/**
 * One garment to order: its pieces per size, across every category that
 * includes it. `type` is null for the "not listed" item, sized runners in a
 * category whose "What's Included" is still empty.
 */
export type GarmentRow = {
  name: string;
  type: GarmentType | null;
  /** In category order. */
  categoryIds: string[];
  /** Pieces per size, chart order; `byCategory` holds only `categoryIds`. */
  sizes: SizeRow[];
  total: number;
};

/** The item a category's sized runners count under when its inclusions are empty. */
export const UNLISTED_GARMENT = "Shirt (not listed in What's Included)";

export type KitSplit = {
  pickup: number;
  /** Delivered kits, split by zone where the race asked; otherwise one row. */
  delivery: { label: string; count: number }[];
  /** Where and when pickup happens, as the runners were told, or that nobody has said. */
  pickupWhere: string;
};

/** Registrants whose order was placed in one bar's span: a day, or a week from `day`. */
export type TrendBar = { day: string; count: number };

export type RegistrationTrend = {
  /** Oldest first, every span from the first order to today (or race day) present, zeros included. */
  bars: TrendBar[];
  /** 1 for a bar a day; 7 when the span is long enough that daily bars would be slivers. */
  daysPerBar: 1 | 7;
  /** Registrants in the last seven days, today included. */
  lastSevenDays: number;
  /** The single busiest day, or null before anyone registered. */
  busiest: TrendBar | null;
};

export type ViewerRaceReport = {
  event: ViewerEventSummary;
  /** Pieces to order, singlets first, then T-shirts, then anything not listed. */
  garments: GarmentRow[];
  kits: KitSplit;
  trend: RegistrationTrend;
};

/** The registrants: paid, or a bank transfer awaiting verification. Shared with `client-runners.ts`. */
export function registrantOrders(): Prisma.RegistrationWhereInput {
  return { deletedAt: null, OR: [{ status: 'PAID' }, awaitingVerificationWhere()] };
}

export async function viewerRaceReport(actor: Actor, eventId: string): Promise<ViewerRaceReport | null> {
  const [event] = await viewerEventSummaries(actor, eventId);
  if (!event) return null;

  const [sizeGroups, orders, logistics, inclusions] = await Promise.all([
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
        createdAt: true,
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
    prisma.category.findMany({
      where: { id: { in: event.categories.map(category => category.id) } },
      select: { id: true, inclusions: true },
    }),
  ]);

  return {
    event,
    garments: garmentTable(sizeTable(sizeGroups), event.categories, new Map(inclusions.map(c => [c.id, c.inclusions]))),
    kits: kitSplit(orders, logistics),
    trend: registrationTrend(orders, event.date),
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

const TYPE_ORDER: (GarmentType | null)[] = ['SINGLET', 'TSHIRT', null];

/**
 * The runner counts turned into pieces: every garment a category includes
 * takes that category's sizes once. Garments are matched across categories by
 * name (`WearableItem.key`), so a Race Singlet worn by every distance is one
 * line to order, while an Event Shirt and a Finisher Shirt stay two prints.
 */
function garmentTable(
  { sizes, sizedByCategory }: { sizes: SizeRow[]; sizedByCategory: Record<string, number> },
  categories: { id: string }[],
  inclusionsById: Map<string, string[]>,
): GarmentRow[] {
  const garments = new Map<string, Omit<GarmentRow, 'sizes' | 'total'>>();
  for (const category of categories) {
    if (!sizedByCategory[category.id]) continue;
    const listed = (inclusionsById.get(category.id) ?? []).filter(item => item.trim());
    const items =
      listed.length === 0
        ? [{ key: 'UNLISTED', name: UNLISTED_GARMENT, type: null }]
        : wearableItems(listed);
    for (const item of items) {
      const garment = garments.get(item.key) ?? { name: item.name, type: item.type, categoryIds: [] };
      garment.categoryIds.push(category.id);
      garments.set(item.key, garment);
    }
  }

  // Sorting is stable, so within a type the order is the order first met.
  return [...garments.values()]
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
    .map(garment => {
      const rows: SizeRow[] = [];
      for (const row of sizes) {
        const byCategory: Record<string, number> = {};
        let total = 0;
        for (const id of garment.categoryIds) {
          if (!row.byCategory[id]) continue;
          byCategory[id] = row.byCategory[id];
          total += row.byCategory[id];
        }
        if (total > 0) rows.push({ size: row.size, byCategory, total });
      }
      return { ...garment, sizes: rows, total: rows.reduce((sum, row) => sum + row.total, 0) };
    });
}

/**
 * Older orders stored a size as the runner typed it — "Large", "medium",
 * "XXL" — before the picker offered the chart's codes. Counted apart, an
 * organizer reads 52 L and 2 LARGE and orders two shirts short of the truth,
 * so the spelled-out names are folded into the code they mean. Only for what
 * is shown (this count, and `client-runners.ts`' list, so the two agree): the
 * stored value is the runner's and is left as it is.
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

export function chartSize(stored: string): string {
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

/** Past this many days, a bar a day is a sliver on a phone, so the bars become weeks. */
const DAILY_BARS_UP_TO = 62;

/**
 * Registrants per Manila day, from the day of the first order to today — or to
 * race day, once it has passed, so a finished race's chart stops there rather
 * than trailing weeks of zeros. A day nobody registered is a zero bar, not a
 * gap, or a quiet week would read as no time passing at all.
 *
 * Counted by the day the **order** was placed (`createdAt`), with every runner
 * on it: a bank transfer verified three days later still registered the day it
 * was sent. The same registrants as every other count on the page, so the bars
 * add up to the Registered tile.
 */
function registrationTrend(
  orders: { createdAt: Date; _count: { runners: number } }[],
  raceDay: string,
): RegistrationTrend {
  const perDay = new Map<string, number>();
  for (const order of orders) {
    if (order._count.runners === 0) continue;
    const { day } = eventInstantParts(order.createdAt);
    perDay.set(day, (perDay.get(day) ?? 0) + order._count.runners);
  }
  const days = [...perDay.keys()].sort();
  if (days.length === 0) return { bars: [], daysPerBar: 1, lastSevenDays: 0, busiest: null };

  const now = today();
  const first = days[0];
  const lastOrder = days[days.length - 1];
  const raceEnd = isCalendarDay(raceDay) && raceDay < now ? raceDay : now;
  const last = lastOrder > raceEnd ? lastOrder : raceEnd;

  const span = daysBetween(first, last) + 1;
  const daysPerBar = span > DAILY_BARS_UP_TO ? 7 : 1;
  const bars: TrendBar[] = [];
  for (let offset = 0; offset < span; offset += daysPerBar) {
    const day = addDays(first, offset);
    let count = 0;
    for (let inBar = 0; inBar < daysPerBar && offset + inBar < span; inBar++) {
      count += perDay.get(addDays(first, offset + inBar)) ?? 0;
    }
    bars.push({ day, count });
  }

  const weekAgo = addDays(now, -6);
  let lastSevenDays = 0;
  let busiest: TrendBar = { day: first, count: 0 };
  for (const [day, count] of perDay) {
    if (day >= weekAgo && day <= now) lastSevenDays += count;
    if (count > busiest.count || (count === busiest.count && day < busiest.day)) busiest = { day, count };
  }
  return { bars, daysPerBar, lastSevenDays, busiest };
}

/** Calendar-day arithmetic in UTC, where a day is always 24 hours. */
function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
