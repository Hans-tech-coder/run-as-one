import React from 'react';
import { BadgeCheck, CalendarDays, Hourglass, MapPin, Users } from 'lucide-react';
import EventImage from '@/components/EventImage';
import { formatEventDayShort, formatEventInstant } from '@/lib/event-schedule';
import type { RegistrantCounts, ViewerEventSummary } from '@/lib/client-summary';
import { REGISTRATION_STATES } from './events/registration-state-badge';

/**
 * A client viewer's `/admin` (ADMIN_MERGE_PLAN.md, Batch 4): its own races,
 * and how many runners have registered for each. Nothing else.
 *
 * **Counts, never money, names or links into the team's screens.** Every
 * number here comes from `lib/client-summary.ts`, whose shape has no field for
 * anything more. The cards are not links: there is no page behind a race that
 * a viewer may open, and a card that looks pressable and goes nowhere is the
 * dead end §8 forbids.
 *
 * Three tiles total the races — registered, paid, pending — then one card per
 * race: its poster, the same registration badge the team's events table
 * wears, its date and place, its total, and the paid / pending split over
 * the whole race and per category. The split bar is drawn for the eye only
 * (`aria-hidden`); the two numbers beside it are words, so the colours never
 * carry the meaning on their own.
 *
 * Server-rendered, no client state. The route's wait draws the same tiles and
 * cards (`route-loading-shape.ts`, `VIEWER_OVERVIEW_SHAPE`).
 */
export default function ViewerDashboard({
  clientName,
  events,
  totals,
}: {
  clientName: string;
  events: ViewerEventSummary[];
  totals: RegistrantCounts;
}) {
  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Your Events</h1>
      </header>

      <div className="admin-content">
        <div className="metrics-grid">
          <Tile title="Registered Runners" value={totals.total} icon={<Users size={20} />} />
          <Tile title="Paid" value={totals.paid} icon={<BadgeCheck size={20} />} />
          <Tile title="Pending Payment" value={totals.pending} icon={<Hourglass size={20} />} />
        </div>

        {events.length === 0 ? (
          <div className="admin-panel">
            <div className="empty-state">
              <CalendarDays size={48} className="empty-icon" aria-hidden="true" />
              <div>
                <p className="mb-2 text-lg font-bold text-white">No events linked yet</p>
                <p className="m-0 max-w-md text-sm leading-relaxed">
                  When Run As One links a race to {clientName || 'your organization'}, it appears
                  here with how many runners have registered — paid and pending, and for each
                  category.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <ul className="viewer-event-grid" aria-label="Your events">
            {events.map(event => (
              <li key={event.id}>
                <EventSummaryCard event={event} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Tile({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        <div className="metric-icon" aria-hidden="true">{icon}</div>
      </div>
      <div className="metric-value">{value.toLocaleString('en-US')}</div>
    </div>
  );
}

function EventSummaryCard({ event }: { event: ViewerEventSummary }) {
  const state = REGISTRATION_STATES[event.state];
  const headingId = `viewer-event-${event.id}`;

  return (
    <article className="viewer-event-card" aria-labelledby={headingId}>
      <div className="viewer-event-poster">
        <EventImage src={event.imageUrl} alt="" className="h-full w-full object-cover" iconSize={40} />
      </div>

      <div className="viewer-event-body">
        <div>
          <span className={`status-badge ${state.tone} whitespace-nowrap`}>{state.label}</span>
          {event.state === 'SCHEDULED' && event.registrationOpensAt && (
            <span className="status-note neutral">
              Opens {formatEventInstant(event.registrationOpensAt)}
            </span>
          )}
        </div>

        <h2 id={headingId} className="viewer-event-title">{event.title}</h2>

        <p className="viewer-event-meta">
          <span>
            <CalendarDays size={14} aria-hidden="true" />
            {formatEventDayShort(event.date)}
          </span>
          {event.location && (
            <span>
              <MapPin size={14} aria-hidden="true" />
              {event.location}
            </span>
          )}
        </p>

        <div className="viewer-event-total">
          <span className="viewer-event-count">{event.counts.total.toLocaleString('en-US')}</span>
          <span className="viewer-event-count-label">
            {event.counts.total === 1 ? 'runner registered' : 'runners registered'}
          </span>
        </div>

        <SplitBar counts={event.counts} />
        <p className="viewer-split-legend">
          <span className="is-paid">{event.counts.paid.toLocaleString('en-US')} Paid</span>
          <span className="is-pending">{event.counts.pending.toLocaleString('en-US')} Pending</span>
        </p>

        {event.categories.length > 0 && (
          <div className="viewer-categories">
            <h3 className="viewer-categories-title">By category</h3>
            <ul>
              {event.categories.map(category => (
                <li key={category.id} className="viewer-category">
                  <span className="viewer-category-name">
                    {category.name}
                    {category.distance ? ` (${category.distance})` : ''}
                  </span>
                  <span className="viewer-category-counts">
                    <span className="viewer-category-total">
                      {category.total.toLocaleString('en-US')}
                    </span>
                    <span className="viewer-category-split">
                      {category.paid.toLocaleString('en-US')} paid · {category.pending.toLocaleString('en-US')} pending
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

/** Paid against pending across the race, for the eye; the legend under it says it in words. */
function SplitBar({ counts }: { counts: RegistrantCounts }) {
  const paidShare = counts.total > 0 ? (counts.paid / counts.total) * 100 : 0;
  return (
    <div className={`viewer-split-bar ${counts.total === 0 ? 'is-empty' : ''}`} aria-hidden="true">
      {counts.total > 0 && (
        <>
          <span className="is-paid" style={{ width: `${paidShare}%` }} />
          <span className="is-pending" style={{ width: `${100 - paidShare}%` }} />
        </>
      )}
    </div>
  );
}
