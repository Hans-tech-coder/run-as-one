/**
 * What a client viewer is shown about its own races (ADMIN_MERGE_PLAN.md,
 * Batch 4) — and, by what this module leaves out, what it is not.
 *
 * The owner's answer is that an organizer sees that its events exist and how
 * many runners have registered: the total, per category, and Paid against
 * Pending. So this reads **counts and nothing else** — no amount, no fee, no
 * name, no contact, no order reference ever leaves the query, and the shape
 * returned has no field a screen could render one into. A money column added
 * to a viewer's page later has to be added here first, which is the review
 * this module exists to force.
 *
 * A registrant is a **runner**, counted the way the staff Overview counts one:
 * a removed runner (`deletedAt`) is kept for the trail and never counted, and
 * only `PAID` and `PENDING` orders count — the two statuses that hold a slot
 * (`SLOT_HOLDING_STATUSES`). An expired, cancelled or refunded order is not a
 * registrant, and showing it would promise the organizer a runner who is not
 * coming.
 *
 * Every event is read through `reachableEvents(actor, 'event:view-summary')`
 * and asked `can()` with its own `clientId`, so a viewer sees its client's
 * races and any other actor that reaches this sees exactly what that
 * permission gives it. Server-only.
 */

import prisma from './db';
import { can, reachableEvents, type Actor } from './actor';
import { CATEGORY_ORDER } from './category-order';
import { hasFinished, today } from './event-schedule';
import {
  SLOT_HOLDING_STATUSES,
  registrationState,
  withSlotCounts,
  type RegistrationState,
} from './registration-gate';

export type RegistrantCounts = { paid: number; pending: number; total: number };

export type ViewerCategorySummary = {
  id: string;
  name: string;
  /** "10KM" for a race option, empty for a fun run package. */
  distance: string;
} & RegistrantCounts;

export type ViewerEventSummary = {
  id: string;
  title: string;
  /** YYYY-MM-DD, as stored. */
  date: string;
  location: string;
  imageUrl: string;
  state: RegistrationState;
  /** When a SCHEDULED event opens, for the line under its badge. */
  registrationOpensAt: Date | null;
  counts: RegistrantCounts;
  categories: ViewerCategorySummary[];
};

const NONE: RegistrantCounts = { paid: 0, pending: 0, total: 0 };

/**
 * The events this actor may see a summary of, soonest race first and finished
 * races after, each with its registrant counts.
 */
export async function viewerEventSummaries(actor: Actor): Promise<ViewerEventSummary[]> {
  const events = await prisma.event.findMany({
    where: reachableEvents(actor, 'event:view-summary'),
    select: {
      id: true,
      title: true,
      date: true,
      location: true,
      imageUrl: true,
      organizerId: true,
      clientId: true,
      registrationPaused: true,
      registrationOpensAt: true,
      categories: {
        orderBy: CATEGORY_ORDER,
        select: { id: true, name: true, distance: true, slotLimit: true },
      },
    },
  });

  // The where above already scopes a viewer to its client; can() is asked as
  // well, with the event's own clientId, so the two rules in actor.ts must
  // both agree before a race is shown.
  const visible = events.filter(event =>
    can(actor, 'event:view-summary', {
      organizerId: event.organizerId,
      eventId: event.id,
      clientId: event.clientId,
    }),
  );

  const categoryIds = visible.flatMap(event => event.categories.map(category => category.id));
  const [paid, pending] = await Promise.all([
    runnersByCategory(categoryIds, 'PAID'),
    runnersByCategory(categoryIds, 'PENDING'),
  ]);

  const day = today();
  const summaries: ViewerEventSummary[] = visible.map(event => {
    const categories = event.categories.map(category => {
      const paidHere = paid.get(category.id) ?? 0;
      const pendingHere = pending.get(category.id) ?? 0;
      return {
        id: category.id,
        name: category.name,
        distance: category.distance,
        paid: paidHere,
        pending: pendingHere,
        total: paidHere + pendingHere,
      };
    });

    // The same answer the events table and the public page give: PAID and
    // PENDING are exactly the slot-holding statuses, so these counts are the
    // taken slots registrationState needs.
    const taken = new Map(categories.map(category => [category.id, category.total]));
    const finished = hasFinished(event, day);

    return {
      id: event.id,
      title: event.title,
      date: event.date,
      location: event.location,
      imageUrl: event.imageUrl,
      state: registrationState(event, withSlotCounts(event.categories, taken), finished),
      registrationOpensAt: event.registrationOpensAt,
      counts: categories.reduce(
        (sum, category) => ({
          paid: sum.paid + category.paid,
          pending: sum.pending + category.pending,
          total: sum.total + category.total,
        }),
        NONE,
      ),
      categories,
    };
  });

  // Races still ahead first, soonest at the top — the one an organizer is
  // asking about is the next one. Races already run follow, latest first.
  // (FINISHED is registrationState's answer exactly when the race is run.)
  return summaries.sort((a, b) => {
    const aDone = a.state === 'FINISHED';
    const bDone = b.state === 'FINISHED';
    if (aDone !== bDone) return aDone ? 1 : -1;
    return aDone ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
}

/** Runners holding a slot in each category under one status, in one grouped query. */
async function runnersByCategory(
  categoryIds: string[],
  status: (typeof SLOT_HOLDING_STATUSES)[number],
): Promise<Map<string, number>> {
  if (categoryIds.length === 0) return new Map();
  const rows = await prisma.runner.groupBy({
    by: ['categoryId'],
    where: {
      categoryId: { in: categoryIds },
      deletedAt: null,
      registration: { status },
    },
    _count: { _all: true },
  });
  return new Map(rows.map(row => [row.categoryId, row._count._all]));
}

/** The counts of every event together, for the tiles above the cards. */
export function totalCounts(events: ViewerEventSummary[]): RegistrantCounts {
  return events.reduce(
    (sum, event) => ({
      paid: sum.paid + event.counts.paid,
      pending: sum.pending + event.counts.pending,
      total: sum.total + event.counts.total,
    }),
    NONE,
  );
}
