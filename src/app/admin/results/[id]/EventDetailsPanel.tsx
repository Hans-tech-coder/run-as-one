import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { formatEventDay } from '@/lib/event-schedule';
import { RESULT_KINDS } from '../result-row';

/**
 * The workspace's Details: what the race is, read-only (RESULTS_NAV_PLAN.md
 * R4). A race that took sign-ups here is the registration event itself, so
 * renaming it from Results would rename that too; its details change in Edit
 * Event, a link away. A results-only race edits on the same form today, so it
 * gets the same link under its own wording.
 */
export default function EventDetailsPanel({
  event,
  editHref,
  title = 'Details',
}: {
  event: {
    title: string;
    date: string;
    location: string;
    resultsOnly: boolean;
    client: { name: string } | null;
    categories: { id: string; name: string }[];
  };
  /** Null without `event:edit`, so nobody is sent to a form that refuses them. */
  editHref: string | null;
  title?: string;
}) {
  const kind = RESULT_KINDS[event.resultsOnly ? 'RESULTS_ONLY' : 'REGISTERED'];

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">{title}</h2>
        {editHref && (
          <Link href={editHref} className="btn-light inline-flex min-h-11 items-center gap-2">
            <Pencil size={16} aria-hidden="true" />
            {event.resultsOnly ? 'Edit details' : 'Edit Event'}
          </Link>
        )}
      </div>
      <div className="admin-panel-content flex flex-col gap-4">
        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Event" value={event.title} />
          <Detail label="Date" value={formatEventDay(event.date)} />
          <Detail label="Location" value={event.location} />
          <Detail label="Client" value={event.client?.name ?? 'None'} />
          <Detail
            label="Categories"
            full
            value={event.categories.length > 0 ? event.categories.map(c => c.name).join(', ') : 'None yet'}
          />
          <Detail
            label="Registration"
            full
            value={<span className={`status-badge ${kind.tone} whitespace-nowrap`}>{kind.label}</span>}
          />
        </dl>
        <p className="m-0 text-sm text-secondary">
          {event.resultsOnly
            ? 'Categories come from the results sheet: a sheet can make its own category on upload.'
            : 'These are the registration event’s own details. Change them in Edit Event, so the race keeps one name everywhere.'}
        </p>
      </div>
    </section>
  );
}

function Detail({ label, value, full = false }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <div className={`min-w-0 ${full ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className="m-0 text-primary [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
