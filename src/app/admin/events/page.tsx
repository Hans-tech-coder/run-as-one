import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { hasFinished } from '@/lib/event-schedule';
import {
  registrationState,
  takenSlotsByCategory,
  withSlotCounts,
} from '@/lib/registration-gate';
import EventsTableClient from './EventsTableClient';

export default async function AdminEventsPage() {
  const auth = await getAuthCookie();
  if (!auth) redirect('/admin/login');

  const events = await db.event.findMany({
    where: { organizerId: auth.id },
    include: {
      categories: true,
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
  }));

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Events</h1>
      </header>

      <div className="admin-content">
        <EventsTableClient events={rows} />
      </div>
    </>
  );
}
