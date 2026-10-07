/**
 * What a client viewer is shown about its own races (ADMIN_MERGE_PLAN.md,
 * Batch 4) — and, by what this module leaves out, what it is not.
 *
 * The owner's answer is that an organizer sees that its events exist and how
 * many runners have registered: the total, per category, split into paid and
 * awaiting verification, with unpaid checkouts beside them. So this reads **counts and nothing else** — no amount, no fee, no
 * name, no contact, no order reference ever leaves the query, and the shape
 * returned has no field a screen could render one into. A money column added
 * to a viewer's page later has to be added here first, which is the review
 * this module exists to force.
 *
 * A registrant is a **runner**, counted the way the staff Overview and events
 * table count one (`heldPlacesByCategory` in `pending-expiry.ts`): a runner on
 * a PAID order or on a bank transfer awaiting verification. A removed runner
 * (`deletedAt`) is kept for the trail and never counted. An **unpaid online
 * checkout** is not a registrant (UNPAID_ORDERS_PLAN.md — a client read four
 * registrants on a race that had one), so it is counted apart as `unpaid`; it
 * still holds a slot until the sweep expires it, so it still counts toward
 * the race's taken slots. An expired, cancelled or refunded order is not
 * counted at all, and showing it would promise the organizer a runner who is
 * not coming.
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
import { heldPlacesByCategory, type HeldPlaces } from './pending-expiry';
import {
  registrationState,
  withSlotCounts,
  type RegistrationState,
} from './registration-gate';

/**
 * `total` is the registrants — `paid` plus `awaiting` (bank transfers awaiting
 * verification). `unpaid` online checkouts are never part of it.
 */
export type RegistrantCounts = { paid: number; awaiting: number; unpaid: number; total: number };

export type ViewerCategorySummary = {
  id: string;
  name: string;
  /** "10KM" for a race option, empty for a fun run package. */
  distance: string;
  /** How many places the category has; null when it is unlimited. */
  slotLimit: number | null;
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

const NONE: RegistrantCounts = { paid: 0, awaiting: 0, unpaid: 0, total: 0 };

/**
 * The events this actor may see a summary of, soonest race first and finished
 * races after, each with its registrant counts.
 *
 * `eventId` narrows it to one race, for that race's own page
 * (`client-race-report.ts`): the same read and the same two checks, so the
 * page and the card it was opened from can never disagree about a count.
 */
export async function viewerEventSummaries(
  actor: Actor,
  eventId?: string,
): Promise<ViewerEventSummary[]> {
  const reachable = reachableEvents(actor, 'event:view-summary');
  const events = await prisma.event.findMany({
    where: eventId ? { AND: [reachable, { id: eventId }] } : reachable,
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
  const held: Map<string, HeldPlaces> =
    categoryIds.length === 0 ? new Map() : await heldPlacesByCategory({ categoryId: { in: categoryIds } });

  const day = today();
  const summaries: ViewerEventSummary[] = visible.map(event => {
    const categories = event.categories.map(category => {
      const places = held.get(category.id) ?? { paid: 0, awaiting: 0, unpaid: 0 };
      return {
        id: category.id,
        name: category.name,
        distance: category.distance,
        slotLimit: category.slotLimit,
        ...places,
        total: places.paid + places.awaiting,
      };
    });

    // The same answer the events table and the public page give: the three
    // kinds together are exactly the slot-holding statuses (an unpaid checkout
    // holds its slot too), so their sum is the taken slots registrationState
    // needs — not `total`, which is the registrants alone.
    const taken = new Map(
      categories.map(category => [category.id, category.total + category.unpaid]),
    );
    const finished = hasFinished(event, day);

    return {
      id: event.id,
      title: event.title,
      date: event.date,
      location: event.location,
      imageUrl: event.imageUrl,
      state: registrationState(event, withSlotCounts(event.categories, taken), finished),
      registrationOpensAt: event.registrationOpensAt,
      counts: categories.reduce(addCounts, NONE),
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

/** Two sets of counts added kind by kind. */
function addCounts(a: RegistrantCounts, b: RegistrantCounts): RegistrantCounts {
  return {
    paid: a.paid + b.paid,
    awaiting: a.awaiting + b.awaiting,
    unpaid: a.unpaid + b.unpaid,
    total: a.total + b.total,
  };
}

/** The counts of every event together, for the tiles above the cards. */
export function totalCounts(events: ViewerEventSummary[]): RegistrantCounts {
  return events.reduce((sum, event) => addCounts(sum, event.counts), NONE);
}
