import React from 'react';
import Link from 'next/link';
import { Users, CalendarDays, CircleCheck, ChevronRight, Plus, Eye } from 'lucide-react';
import { formatPesos } from '@/lib/money';
import { formatEventDayShort, formatInstantDay } from '@/lib/event-schedule';
import AdminCardList from './AdminCardList';
import type { OverviewLiveRow, OverviewOrder } from './overview-data';

/**
 * The Overview's three lists, below its money tiles (`page.tsx`): the bank
 * transfers waiting on staff, the races still filling, and the latest paid
 * orders. Each row opens the screen where it is acted on.
 */

/** How many live races get a row before the rest are left to the Events screen. */
const LIVE_ROWS = 6;
/** A transfer waiting this long reads amber — a runner has been left wondering for two days. */
const OVERDUE_HOURS = 48;

/**
 * "5m", "3h", "2d" — how long an order has waited, as a glance reads it. The
 * age matters to the person verifying more than the date does: the queue is
 * worked oldest first.
 */
function waitedFor(since: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Where an order is acted on: its race's registrants, searched down to it. */
function orderHref(eventId: string, orderRef: string): string {
  return `/admin/events/${eventId}/registrants?search=${encodeURIComponent(orderRef)}`;
}

function runnersLabel(count: number): string {
  return `${count} ${count === 1 ? 'runner' : 'runners'}`;
}

export function AwaitingPanel({ count, queue, now }: { count: number; queue: OverviewOrder[]; now: Date }) {
  // On a calm morning this is one quiet line, not an empty state: most days
  // nothing is waiting, and the page must not grow for it.
  if (count === 0) {
    return (
      <div className="overview-quiet">
        <CircleCheck size={18} aria-hidden="true" />
        <span>No bank transfers awaiting verification.</span>
      </div>
    );
  }

  return (
    <section className="admin-panel" aria-labelledby="overview-awaiting">
      <div className="admin-panel-header">
        <h2 id="overview-awaiting" className="admin-panel-title">
          Awaiting Verification <span className="overview-count">{count}</span>
        </h2>
        {count > queue.length && (
          <span className="overview-panel-note">Oldest {queue.length} shown</span>
        )}
      </div>
      <ul className="overview-list">
        {queue.map(order => {
          const hours = (now.getTime() - order.createdAt.getTime()) / 3_600_000;
          return (
            <li key={order.id}>
              <Link href={orderHref(order.event.id, order.orderRef)} className="overview-row">
                <span className="overview-row-main">
                  <span className="overview-row-title">{order.customerName}</span>
                  <span className="overview-row-meta">
                    {order.event.title} · {order.orderRef} · {runnersLabel(order._count.runners)}
                  </span>
                </span>
                <span className="overview-row-side">
                  <span className="overview-row-amount">₱{formatPesos(order.totalAmount)}</span>
                  <span className={`overview-age${hours >= OVERDUE_HOURS ? ' is-overdue' : ''}`}>
                    Waiting {waitedFor(order.createdAt, now)}
                  </span>
                </span>
                <ChevronRight size={16} className="overview-row-go" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LiveEventsPanel({ rows }: { rows: OverviewLiveRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="admin-panel" aria-labelledby="overview-live">
      <div className="admin-panel-header">
        <h2 id="overview-live" className="admin-panel-title">Live Events</h2>
        {rows.length > LIVE_ROWS && (
          <Link href="/admin/events" className="overview-panel-link">
            All {rows.length} <ChevronRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      <ul className="overview-list">
        {rows.slice(0, LIVE_ROWS).map(event => {
          const taken = event.paid + event.awaiting + event.unpaid;
          const pct = (n: number) => (event.capacity ? `${Math.min(100, (n / event.capacity) * 100)}%` : '0%');
          return (
            <li key={event.id}>
              {/* The row opens the registrants screen and its unpaid
                  count opens the Unpaid checkouts tab. A link cannot
                  hold another link, so the title's link stretches over
                  the row (.overview-row.has-links) and the count sits
                  above it. */}
              <div className="overview-row has-links">
                <span className="overview-row-main">
                  <Link href={`/admin/events/${event.id}/registrants`} className="overview-row-title overview-row-link">
                    {event.title}
                  </Link>
                  <span className="viewer-split-legend">
                    <span className="is-paid">{event.paid.toLocaleString('en-US')} paid</span>
                    <span className="is-pending">{event.awaiting.toLocaleString('en-US')} awaiting verification</span>
                    {event.unpaid > 0 && (
                      <Link href={`/admin/events/${event.id}/registrants?tab=unpaid`} className="is-unpaid overview-row-sublink">
                        {event.unpaid.toLocaleString('en-US')} unpaid checkout{event.unpaid === 1 ? '' : 's'}
                      </Link>
                    )}
                  </span>
                  {event.capacity !== null && (
                    <span className="viewer-split-bar overview-fill" aria-hidden="true">
                      <span className="is-paid" style={{ width: pct(event.paid) }} />
                      <span className="is-pending" style={{ width: pct(event.awaiting) }} />
                      <span className="is-unpaid" style={{ width: pct(event.unpaid) }} />
                    </span>
                  )}
                </span>
                <span className="overview-row-side">
                  <span className="overview-row-amount">{formatEventDayShort(event.date)}</span>
                  <span className="overview-age">
                    {event.capacity !== null
                      ? `${taken.toLocaleString('en-US')} of ${event.capacity.toLocaleString('en-US')} slots`
                      : 'No slot cap'}
                  </span>
                </span>
                <ChevronRight size={16} className="overview-row-go" aria-hidden="true" />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RecentPanel({ recent, canCreate }: { recent: OverviewOrder[]; canCreate: boolean }) {
  return (
    <section className="admin-panel" aria-labelledby="overview-recent">
      <div className="admin-panel-header">
        <h2 id="overview-recent" className="admin-panel-title">Recent Registrations</h2>
      </div>

      {recent.length === 0 ? (
        <div className="empty-state">
          <Users size={48} className="empty-icon" />
          <p>No registrations yet. Publish an event to get started.</p>
          {canCreate ? (
            <Link href="/admin/events/new" className="btn-light">
              <Plus size={16} /> Create Event
            </Link>
          ) : (
            <Link href="/admin/events" className="btn-light">
              <CalendarDays size={16} /> Go to Events
            </Link>
          )}
        </div>
      ) : (
        <>
        {/* The table from lg up, the same five as cards below it — Admin.css
            decides which is seen, so the first paint is already right. The
            reference opens the order on its race's registrants screen. */}
        <div className="data-table-wrapper dash-desktop-only">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Customer Name</th>
                <th>Event</th>
                <th>Amount</th>
                <th>Runners</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(reg => (
                <tr key={reg.id}>
                  <td>
                    <Link href={orderHref(reg.event.id, reg.orderRef)} className="overview-ref">
                      {reg.orderRef}
                    </Link>
                  </td>
                  <td>{reg.customerName}</td>
                  <td>{reg.event.title}</td>
                  <td>₱{formatPesos(reg.totalAmount)}</td>
                  <td>{reg._count.runners}</td>
                  <td>{formatInstantDay(reg.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="dash-mobile-only">
          <AdminCardList
            label="Recent registrations"
            items={recent}
            getKey={reg => reg.id}
            title={reg => reg.customerName}
            subtitle={reg => reg.orderRef}
            fields={reg => [
              { label: 'Event', value: reg.event.title, full: true },
              { label: 'Amount', value: `₱${formatPesos(reg.totalAmount)}` },
              { label: 'Runners', value: reg._count.runners },
              { label: 'Date', value: formatInstantDay(reg.createdAt) },
            ]}
            actions={reg => (
              <Link href={orderHref(reg.event.id, reg.orderRef)} className="btn-light">
                <Eye size={16} /> View Order
              </Link>
            )}
          />
        </div>
        </>
      )}
    </section>
  );
}
