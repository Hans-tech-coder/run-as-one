import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import prisma from '@/lib/db';
import { can, requireActor } from '@/lib/actor';
import { readActivityFilters } from '@/lib/activity';
import { activityPeople, activityWhere } from '@/lib/activity-store';
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
 * or deleted, an offset against a pinned instant is exactly stable.
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

  const now = new Date();
  const { filters, errors } = readActivityFilters(await searchParams, now);
  const asOf = filters.asOf ? new Date(filters.asOf) : now;
  const base = activityWhere(actor.orgId, filters, errors, now);
  const pinned = { AND: [base, { createdAt: { lte: asOf } }] };

  const [total, newer, people, events] = await Promise.all([
    prisma.auditLog.count({ where: pinned }),
    filters.asOf
      ? prisma.auditLog.count({ where: { AND: [base, { createdAt: { gt: asOf } }] } })
      : Promise.resolve(0),
    activityPeople(actor.orgId),
    prisma.event.findMany({
      where: { organizerId: actor.orgId },
      orderBy: soonestFirst,
      select: { id: true, title: true, date: true },
    }),
  ]);

  // A page past the end (a filter narrowed the list under a deep link) lands
  // on the last page there is rather than on an empty one.
  const lastPage = Math.max(1, Math.ceil(total / filters.size));
  const page = Math.min(filters.page, lastPage);

  const entries = await prisma.auditLog.findMany({
    where: pinned,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * filters.size,
    take: filters.size,
    select: {
      id: true,
      createdAt: true,
      actorKind: true,
      actorId: true,
      actorName: true,
      actorEmail: true,
      action: true,
      eventId: true,
      summary: true,
      changes: true,
      ip: true,
      userAgent: true,
    },
  });

  // The trail has no relations (an entry outlives its event), so titles are
  // looked up here. An id with no event behind it is a race that was deleted,
  // and the entry's own sentence still names it.
  const titles = new Map(events.map(event => [event.id, event.title]));

  const rows: ActivityRow[] = entries.map(entry => ({
    id: entry.id,
    at: entry.createdAt.toISOString(),
    actorKind: entry.actorKind,
    actorName: entry.actorName,
    actorEmail: entry.actorEmail,
    action: entry.action,
    eventId: entry.eventId,
    eventTitle: entry.eventId ? (titles.get(entry.eventId) ?? null) : null,
    summary: entry.summary,
    changes: entry.changes ?? null,
    ip: entry.ip,
    userAgent: entry.userAgent,
  }));

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Activity</h1>
      </header>

      <div className="admin-content">
        <ActivityClient
          rows={rows}
          total={total}
          newer={newer}
          filters={{ ...filters, page, asOf: asOf.toISOString() }}
          pinned={Boolean(filters.asOf)}
          errors={errors}
          people={people}
          events={events}
          now={now.toISOString()}
        />
      </div>
    </>
  );
}
