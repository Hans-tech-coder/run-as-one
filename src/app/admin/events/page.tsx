import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import db from '@/lib/db';
import { can, reachableEvents, requireTeamActor } from '@/lib/actor';
import { hasFinished } from '@/lib/event-schedule';
import {
  registrationState,
  takenSlotsByCategory,
  withSlotCounts,
} from '@/lib/registration-gate';
import { CATEGORY_ORDER } from '@/lib/category-order';
import EventsTableClient from './EventsTableClient';

export default async function AdminEventsPage() {
  const actor = await requireTeamActor();

  const events = await db.event.findMany({
    // Every event of the organizer for its owner; only the assigned races for
    // a STAFF member (lib/actor.ts).
    where: reachableEvents(actor),
    include: {
      categories: { orderBy: CATEGORY_ORDER },
      // The delete confirmation names how many registrations go with the
      // event, because removing one now removes those rows too.
      _count: { select: { registrations: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Whether each event is taking sign-ups, and why not. Worked out here rather
  // than in the table because it is a database count: one grouped query across
  // every option on the page, not one per row.
  const taken = await takenSlotsByCategory(
    events.flatMap((event) => event.categories.map((category) => category.id)),
  );
  const rows = events.map((event) => ({
    ...event,
    registrationState: registrationState(
      event,
      withSlotCounts(event.categories, taken),
      hasFinished(event),
    ),
    // What this person may do from the row's menu, asked with the same can()
    // the route behind each item asks — so a validator is never offered
    // Delete Event only to be refused by it. Registrants and Manage Results
    // stay for everyone: every role may read both.
    access: {
      edit: can(actor, 'event:edit', { organizerId: actor.orgId, eventId: event.id }),
      delete: can(actor, 'event:delete', { organizerId: actor.orgId, eventId: event.id }),
    },
  }));

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Events</h1>
      </header>

      <div className="admin-content">
        <EventsTableClient
          events={rows}
          canCreate={can(actor, 'event:create', { organizerId: actor.orgId })}
        />
      </div>
    </>
  );
}
