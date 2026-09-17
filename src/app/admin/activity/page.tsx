import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import prisma from '@/lib/db';
import { can, requireActor } from '@/lib/actor';
import { loadActivityPage } from '@/lib/activity-store';
import { soonestFirst } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import ActivityClient, { type ActivityRow } from './ActivityClient';

export const metadata: Metadata = {
  title: `Activity | ${SITE_NAME} Admin`,
};

/**
 * The trail, read back: what everyone signed in to this organizer did, newest
 * first (STAFF_ACCESS_PLAN.md, Batch 3). This is where "sino ang gumawa nito"
 * gets its answer.
 *
 * Only a role holding `activity:view` (owner and admin) has this screen;
 * anyone else gets the admin's own 404, as on the team screen.
 *
 * **Paged on the server, unlike the admin's other tables.** Those load their
 * whole list and page it in the browser, which is right for a race's
 * registrants and wrong for a log that only grows. So the filters are the URL
 * (`lib/activity.ts`), the database does the narrowing, and one page of rows
 * crosses the wire.
 *
 * **The order is fixed and never re-sorts.** Newest first is what a trail is,
 * and there are no sortable headers: a reader tracing a sequence of events
 * must be able to trust that the row above happened after the row below. The
 * reading is pinned with `asOf` once they page past the first screen, so an
 * entry recorded mid-read waits in a "newer entries" count instead of shifting
 * every row they are looking at. Because nothing in the trail is ever edited
 * or deleted, an offset against a pinned instant is exactly stable. The
 * reading itself is `loadActivityPage` (lib/activity-store.ts).
 *
 * **Organizer decisions are here too.** Run As One staff decide applications
 * inside Run As One's own tenant, so those rows are this trail's since the
 * dashboards merged (ADMIN_MERGE_PLAN.md, Batch 2); `/superadmin/activity`
 * redirects here.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  if (!can(actor, 'activity:view', { organizerId: actor.orgId })) {
    notFound();
  }

  const [reading, events] = await Promise.all([
    loadActivityPage(actor.orgId, await searchParams),
    prisma.event.findMany({
      where: { organizerId: actor.orgId },
      orderBy: soonestFirst,
      select: { id: true, title: true, date: true },
    }),
  ]);

  // The trail has no relations (an entry outlives its event), so titles are
  // looked up here. An id with no event behind it is a race that was deleted,
  // and the entry's own sentence still names it.
  const titles = new Map(events.map(event => [event.id, event.title]));

  const rows: ActivityRow[] = reading.entries.map(entry => ({
    ...entry,
    eventTitle: entry.eventId ? (titles.get(entry.eventId) ?? null) : null,
  }));

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Activity</h1>
      </header>

      <div className="admin-content">
        <ActivityClient
          rows={rows}
          total={reading.total}
          newer={reading.newer}
          filters={reading.filters}
          pinned={reading.pinned}
          errors={reading.errors}
          people={reading.people}
          events={events}
          now={reading.now}
        />
      </div>
    </>
  );
}
