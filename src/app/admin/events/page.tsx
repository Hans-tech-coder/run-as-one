import React from 'react';
import Link from 'next/link';
import { Plus, Edit, Users, Trophy } from 'lucide-react';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DeleteEventButton from './DeleteEventButton';

export default async function AdminEventsPage() {
  const auth = await getAuthCookie();
  if (!auth) redirect('/admin/login');

  const events = await db.event.findMany({
    where: { organizerId: auth.id },
    include: {
      categories: true,
      // Registrations count can be added here if Registration model is created
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Events</h1>
        <Link href="/admin/events/new" className="btn-gradient px-4 py-2 flex items-center gap-2 text-sm h-10">
          <Plus size={16} /> Create Event
        </Link>
      </header>

      <div className="admin-content">
        <div className="admin-panel">
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event Name</th>
                  <th>Date</th>
                  <th>Categories</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-secondary">
                      No events found. Create one to get started.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id}>
                      <td className="font-medium text-primary">
                        {event.title}
                      </td>
                      <td>{event.date}</td>
                      <td>{event.categories.length} categories</td>
                      <td>{event.location}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Link href={`/admin/events/${event.id}/registrants`} className="p-2 hover:bg-white/10 rounded text-secondary hover:text-accent-blue" title="View Registrants">
                            <Users size={16} />
                          </Link>
                          <Link href={`/admin/events/${event.id}/results`} className="p-2 hover:bg-white/10 rounded text-secondary hover:text-accent-orange" title="Manage Results">
                            <Trophy size={16} />
                          </Link>
                          <Link href={`/admin/events/${event.id}/edit`} className="p-2 hover:bg-white/10 rounded text-secondary hover:text-primary" title="Edit">
                            <Edit size={16} />
                          </Link>
                          <DeleteEventButton eventId={event.id} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
