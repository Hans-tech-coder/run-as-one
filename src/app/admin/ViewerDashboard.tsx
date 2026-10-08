import React from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, BookOpen, CalendarDays, ChevronDown, Hourglass, MapPin, ShoppingCart, Users } from 'lucide-react';
import EventImage from '@/components/EventImage';
import { formatEventDayShort, formatEventInstant } from '@/lib/event-schedule';
import type { RegistrantCounts, ViewerEventSummary } from '@/lib/client-summary';
import { REGISTRATION_STATES } from './events/registration-state-badge';
import DashboardHeader from './DashboardHeader';
import PastEventsGrid from './PastEventsGrid';

/**
 * A client viewer's `/admin` (ADMIN_MERGE_PLAN.md, Batch 4): its own races,
 * and how many runners have registered for each. Nothing else.
 *
 * **Counts, never money, names or links into the team's screens.** Every
 * number here comes from `lib/client-summary.ts`, whose shape has no field for
 * anything more. Each card ends in one labelled link, **View race details
 * and report**, to the race's own viewer page (`your-events/[id]`,
 * CLIENT_RACE_PAGE_PLAN.md). That link is stretched over the whole card, so
 * the card answers the pointer as one target — clients missed the small link
 * at its foot — while it stays a single tab stop with a name that says where
 * it goes. The foot is drawn as a bar, so it reads as the card's action even
 * on a phone, where there is no hover to hint at it.
 *
 * **Built for a client with many races.** The per-category breakdown is
 * folded behind a native `<details>` (closed by default), so every card is
 * the same height and a row of them ends on one line; it sits above the
 * stretched link, so opening it does not open the race. Races already run are
 * folded under **Past events**, closed while there is any race still ahead,
 * so the page does not grow with every season; opened, it shows six at a
 * time with **Show N more past events** (`PastEventsGrid`, the one client
 * piece). Both folds are `<details>`.
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
          <EventSections events={events} />
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

/**
 * Races still ahead, then races already run. `viewerEventSummaries` hands them
 * over in that order (soonest first, then latest first), so this only splits
 * the list. The past fold starts open only when there is nothing ahead, so a
 * client between seasons is not shown an empty page.
 */
function EventSections({ events }: { events: ViewerEventSummary[] }) {
  const upcoming = events.filter(event => event.state !== 'FINISHED');
  const past = events.filter(event => event.state === 'FINISHED');

  return (
    <div className="viewer-event-sections">
      {upcoming.length > 0 && (
        <section aria-labelledby="viewer-upcoming-title">
          <h2 id="viewer-upcoming-title" className="viewer-section-title">
            Upcoming events <span className="viewer-section-count">{upcoming.length}</span>
          </h2>
          <EventGrid events={upcoming} label="Upcoming events" />
        </section>
      )}

      {past.length > 0 && (
        // `open` only when true: a `false` would be re-asserted at hydration
        // over a fold the viewer opened before the page finished loading.
        <details className="viewer-past" open={upcoming.length === 0 || undefined}>
          <summary className="viewer-section-title viewer-past-toggle">
            Past events <span className="viewer-section-count">{past.length}</span>
            <ChevronDown size={18} className="viewer-fold-chevron" aria-hidden="true" />
          </summary>
          <PastEventsGrid cards={past.map(event => <EventSummaryCard key={event.id} event={event} />)} />
        </details>
      )}
    </div>
  );
}

function EventGrid({ events, label }: { events: ViewerEventSummary[]; label: string }) {
  return (
    <ul className="viewer-event-grid" aria-label={label}>
      {events.map(event => (
        <li key={event.id}>
          <EventSummaryCard event={event} />
        </li>
      ))}
    </ul>
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

        <h3 id={headingId} className="viewer-event-title">{event.title}</h3>

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
          <details className="viewer-categories">
            <summary className="viewer-categories-toggle">
              <span>
                By category <span className="viewer-categories-count">{event.categories.length}</span>
              </span>
              <ChevronDown size={16} className="viewer-fold-chevron" aria-hidden="true" />
            </summary>
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
          </details>
        )}

      </div>

      <Link
        href={`/admin/your-events/${event.id}`}
        className="viewer-event-open"
        aria-describedby={headingId}
      >
        <span>View race details and report</span>
        <span className="viewer-event-open-arrow" aria-hidden="true">
          <ArrowRight size={16} />
        </span>
      </Link>
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
