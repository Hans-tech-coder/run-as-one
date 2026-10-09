import React from 'react';
import db from '@/lib/db';
import { can, reachableEvents, requireTeamActor } from '@/lib/actor';
import DashboardHeader from '@/app/admin/DashboardHeader';
import ResultsListClient from './ResultsListClient';
import type { ResultRow } from './result-row';

/**
 * The Results menu's list (RESULTS_NAV_PLAN.md Batch 1): every race whose
 * results live here, in one place instead of behind the Events row menu.
 *
 * A race belongs on it when it is results-only — listed from the moment it is
 * created, before its first upload — or when it has at least one RaceResult.
 * Nothing is stored to mark that results were "started"; the rows themselves
 * are the answer, so a race can never be listed here without them.
 */
export default async function AdminResultsPage() {
  const actor = await requireTeamActor();

  const events = await db.event.findMany({
    where: {
      // The same reach as the Events screen: a STAFF member sees only the
      // races they were given (lib/actor.ts).
      AND: [
        reachableEvents(actor),
        { OR: [{ resultsOnly: true }, { raceResults: { some: {} } }] },
      ],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      location: true,
      resultsOnly: true,
      certificateTemplate: true,
      client: { select: { id: true, name: true } },
      // Both counts ride along for the delete confirmation, which names what
      // goes with the event (DeleteEventModal).
      _count: { select: { raceResults: true, registrations: true } },
    },
    // The most recent race first: what staff open Results for is the race
    // just run. Creation breaks a tie between two races on one day.
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  const rows: ResultRow[] = events.map((event, index) => ({
    id: event.id,
    listNo: index + 1,
    title: event.title,
    slug: event.slug,
    date: event.date,
    location: event.location,
    client: event.client,
    resultsOnly: event.resultsOnly,
    finishers: event._count.raceResults,
    // Run As One's own certificate is always there, so a race without its
    // own template still hands out one: "Default", never "None".
    certificate: event.certificateTemplate ? 'Custom' : 'Default',
    _count: event._count,
    // Asked with the same can() as the route behind each menu item, so
    // nobody is offered Edit or Delete only to be refused by it.
    access: {
      edit: can(actor, 'event:edit', { organizerId: actor.orgId, eventId: event.id }),
      delete: can(actor, 'event:delete', { organizerId: actor.orgId, eventId: event.id }),
    },
  }));

  return (
    <>
      <DashboardHeader title="Results" />

      <div className="admin-content">
        <ResultsListClient
          events={rows}
          // The same rule as the Events screen's Client filter: clients are Run
          // As One's own records.
          canFilterByClient={can(actor, 'platform:manage', { organizerId: actor.orgId })}
        />
      </div>
    </>
  );
}
