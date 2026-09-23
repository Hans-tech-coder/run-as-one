import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getActor, reachableEvents } from '@/lib/actor';
import { formatEventDayShort } from '@/lib/event-schedule';

/**
 * What the dashboard's quick jump can reach beyond the menu
 * (DASHBOARD_SHELL_PLAN.md, Batch 2).
 *
 * Batch 1's palette searched a list the browser already held — the sidebar's
 * rows and the settings pages. Reaching **one race by name** cannot work that
 * way: which events a person may see depends on their role, and shipping every
 * title to the client so it could filter them there would hand a STAFF member
 * the names of the races they were deliberately not assigned to.
 *
 * So the filtering happens here, behind the same gate the registrants screen
 * itself enforces — `reachableEvents(actor, 'registration:view')`. A client
 * viewer holds `event:view-summary` and nothing more, so that `where` comes
 * back empty for one and the palette stays the menu it was in Batch 1. Nothing
 * here decides who may see what; it only asks `actor.ts` the same question the
 * page asks.
 *
 * **Registrants is the destination**, not the event's edit form: a person
 * typing a race's name mid-event-day is looking for the people in it. The row
 * says so, so the jump is never a surprise.
 */

/** Nothing useful is matched by one letter, and every keystroke is a query. */
const MIN_QUERY = 2;

/**
 * Short on purpose. The palette is a way to *one* known thing, so a list long
 * enough to need scrolling means the person should be on the events screen
 * instead — and the static rows have to stay in view underneath.
 */
const LIMIT = 8;

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (query.length < MIN_QUERY) {
    return NextResponse.json({ events: [] });
  }

  const events = await db.event.findMany({
    where: {
      AND: [reachableEvents(actor, 'registration:view'), { title: { contains: query, mode: 'insensitive' } }],
    },
    // `date` is a calendar day stored as `YYYY-MM-DD`, so it sorts as text.
    // Newest first, because the race someone is searching for by name is
    // almost always the one being run now rather than one from two years ago.
    orderBy: { date: 'desc' },
    take: LIMIT,
    select: { id: true, title: true, date: true },
  });

  return NextResponse.json({
    events: events.map(event => ({
      id: event.id,
      title: event.title,
      day: formatEventDayShort(event.date),
      href: `/admin/events/${event.id}/registrants`,
    })),
  });
}
