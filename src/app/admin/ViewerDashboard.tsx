import React from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, BookOpen, CalendarDays, Hourglass, MapPin, ShoppingCart, Users } from 'lucide-react';
import EventImage from '@/components/EventImage';
import { formatEventDayShort, formatEventInstant } from '@/lib/event-schedule';
import type { RegistrantCounts, ViewerEventSummary } from '@/lib/client-summary';
import { REGISTRATION_STATES } from './events/registration-state-badge';
import DashboardHeader from './DashboardHeader';

/**
 * A client viewer's `/admin` (ADMIN_MERGE_PLAN.md, Batch 4): its own races,
 * and how many runners have registered for each. Nothing else.
 *
 * **Counts, never money, names or links into the team's screens.** Every
 * number here comes from `lib/client-summary.ts`, whose shape has no field for
 * anything more. Each card ends in one labelled link, **View race details**,
 * to the race's own viewer page (`your-events/[id]`, CLIENT_RACE_PAGE_PLAN.md);
 * the card itself is not a link, so the counts stay selectable text.
 *
 * Four tiles total the races — registered, paid, awaiting verification and
 * unpaid checkouts — then one card per race: its poster, the same
 * registration badge the team's events table wears, its date and place, its
 * total, and the split over the whole race and per category. The split bar is
 * drawn for the eye only (`aria-hidden`); the numbers beside it are words, so
 * the colours never carry the meaning on their own.
 *
 * **Unpaid checkouts are not registered runners** (UNPAID_ORDERS_PLAN.md): a
 * client once read four registrants on a race that had one. They are shown
 * apart, with one line saying what they are, because a viewer has no list to
 * open and look for itself.
 *
 * Under the tiles, one link to the e-certificate template guide: the one
 * team page a viewer may open, since a client preparing a race is the person
 * who has to brief its designer. It says what it opens in words, never as a
 * bare chevron.
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
      <DashboardHeader title="Your Events" />

      <div className="admin-content">
        <div className="metrics-grid">
          <Tile title="Registered Runners" value={totals.total} icon={<Users size={20} />} />
          <Tile title="Paid" value={totals.paid} icon={<BadgeCheck size={20} />} />
          <Tile title="Awaiting Verification" value={totals.awaiting} icon={<Hourglass size={20} />} />
          <Tile title="Unpaid Checkouts" value={totals.unpaid} icon={<ShoppingCart size={20} />} />
        </div>

        <div className="admin-panel viewer-guide-card">
          <Link href="/admin/certificate-guide" className="overview-row">
            <span className="viewer-guide-icon" aria-hidden="true">
              <BookOpen size={20} />
            </span>
            <span className="overview-row-main">
              <span className="overview-row-title">Preparing your e-certificate?</span>
              <span className="overview-row-meta">
                Where things go on the page, the file specs and a checklist to hand your designer.
              </span>
            </span>
            <span className="viewer-guide-go">
              Read the template guide <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="admin-panel">
            <div className="empty-state">
              <CalendarDays size={48} className="empty-icon" aria-hidden="true" />
              <div>
                <p className="mb-2 text-lg font-bold text-primary">No events linked yet</p>
                <p className="m-0 max-w-md text-sm leading-relaxed">
                  When Run As One links a race to {clientName || 'your organization'}, it appears
                  here with how many runners have registered — paid and awaiting verification,
                  and for each category.
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

/** One count tile; the race page reuses it so the two read alike. */
export function Tile({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
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
          <span className="is-pending">{event.counts.awaiting.toLocaleString('en-US')} Awaiting verification</span>
          {event.counts.unpaid > 0 && (
            <span className="is-unpaid">
              {event.counts.unpaid.toLocaleString('en-US')} Unpaid checkout{event.counts.unpaid === 1 ? '' : 's'}
            </span>
          )}
        </p>
        {event.counts.unpaid > 0 && (
          <p className="viewer-unpaid-note">
            Unpaid checkouts are online payments not finished yet. They are not counted as
            registered and expire automatically.
          </p>
        )}

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
                      {category.paid.toLocaleString('en-US')} paid · {category.awaiting.toLocaleString('en-US')} awaiting
                      {category.unpaid > 0 && ` · ${category.unpaid.toLocaleString('en-US')} unpaid`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href={`/admin/your-events/${event.id}`} className="viewer-event-open">
          View race details <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

/**
 * Paid, awaiting verification and unpaid across the race, for the eye; the
 * legend under it says it in words. Unpaid is the lighter segment at the end:
 * it holds a slot, but it is not a registrant.
 */
function SplitBar({ counts }: { counts: RegistrantCounts }) {
  const whole = counts.total + counts.unpaid;
  const share = (n: number) => `${(n / whole) * 100}%`;
  return (
    <div className={`viewer-split-bar ${whole === 0 ? 'is-empty' : ''}`} aria-hidden="true">
      {whole > 0 && (
        <>
          <span className="is-paid" style={{ width: share(counts.paid) }} />
          <span className="is-pending" style={{ width: share(counts.awaiting) }} />
          <span className="is-unpaid" style={{ width: share(counts.unpaid) }} />
        </>
      )}
    </div>
  );
}
