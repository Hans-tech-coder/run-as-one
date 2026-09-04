import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
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

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Events</h1>
      </header>

      <div className="admin-content">
        <EventsTableClient events={events} />
      </div>
    </>
  );
}
