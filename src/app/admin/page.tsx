import React from 'react';
import Link from 'next/link';
import { DollarSign, Users, CalendarDays, Landmark, CircleCheck, ChevronRight, Plus, Eye } from 'lucide-react';
import prisma from '@/lib/db';
import { can, isClientViewer, reachableEvents, requireActor } from '@/lib/actor';
import { totalCounts, viewerEventSummaries } from '@/lib/client-summary';
import { formatPesos } from '@/lib/money';
import { formatEventDayShort, formatInstantDay, soonestFirst, today, upcomingEvents } from '@/lib/event-schedule';
import { PAYMENT_METHODS } from '@/lib/registration-codes';
import AdminCardList from './AdminCardList';
import ViewerDashboard from './ViewerDashboard';
import DashboardHeader from './DashboardHeader';

/**
 * Run As One's front page (OVERVIEW_PLAN.md, Batch 1): the morning question —
 * what is waiting on us, and how is each race filling — above the all-time
 * numbers, in four blocks and no more. The owner asked for both the work queue
 * and the numbers but not a long page, so a block that is merely interesting
 * does not belong here.
 *
 * **Every figure is counted by the database.** The page used to load every PAID
 * order of every race, with every runner on it, to add up four numbers in
 * JavaScript — a page that got slower with every order the platform took. Now
 * it is a fixed handful of aggregates, counts and `take`-bounded lists, run
 * together, however many orders there are.
 */

/** How many of the oldest bank transfers the queue lists; the heading counts them all. */
const QUEUE_ROWS = 5;
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

export default async function AdminDashboard() {
  const actor = await requireActor();

  // A client viewer's /admin is its own page (ADMIN_MERGE_PLAN.md, Batch 4):
  // its races and their registrant counts, and none of the revenue below.
  if (isClientViewer(actor)) {
    const [events, client] = await Promise.all([
      viewerEventSummaries(actor),
      actor.clientId
        ? prisma.client.findUnique({ where: { id: actor.clientId }, select: { name: true } })
        : null,
    ]);
    return <ViewerDashboard clientName={client?.name ?? ''} events={events} totals={totalCounts(events)} />;
  }

  // Run As One's own number, beside the organizer-facing three: the per-runner
  // admin fees it has collected. It was the super admin dashboard's
  // "Platform Revenue" tile; with one dashboard (ADMIN_MERGE_PLAN.md, Batch 2)
  // it is shown to whoever runs the platform (owner and admin) and to nobody
  // working a single race. The loading skeleton counts the same tiles
  // (route-loading-shape.ts, OVERVIEW_PLATFORM_METRICS).
  const scope = { organizerId: actor.orgId };
  const showPlatformFees = can(actor, 'platform:manage', scope);
  // Money tiles explain themselves on the remittances screen, for the people
  // who may open it; a staff member working one race goes to their events.
  const moneyHref = can(actor, 'remittance:manage', scope) ? '/admin/remittances' : '/admin/events';
  const canCreate = can(actor, 'event:create', scope);

  // The races this person may read registrations on — every event of the
  // organizer for its owner, only the assigned ones for a STAFF member. Every
  // query below is scoped by it, the pending queue included.
  const reachable = reachableEvents(actor, 'registration:view');

  // Races the organizer still has ahead of them, race day itself included —
  // the same line the public listings draw (hasFinished / upcomingEvents in
  // src/lib/event-schedule.ts), so the tile, these rows and /events can never
  // disagree about which races are still live. One reading of "today" is
  // shared, so nothing is counted differently across Manila's midnight.
  const live: typeof reachable = { AND: [reachable, upcomingEvents(today())] };

  // A registration that was removed (a column no screen writes yet — see
  // Registration.deletedAt) is kept for the trail and counted nowhere.
  const paidOrders = { status: 'PAID', deletedAt: null, event: reachable };

  // The queue is bank transfers only. They are the orders a person verifies by
  // hand against a deposit slip; a PENDING online checkout is waiting on
  // PayMongo, not on staff, and the nightly sweep expires it
  // (src/lib/pending-expiry.ts). Both still hold a slot, so the live-race rows
  // below count every PENDING runner.
  const awaiting = {
    status: 'PENDING',
    deletedAt: null,
    paymentMethod: { equals: PAYMENT_METHODS.BANK_TRANSFER, mode: 'insensitive' as const },
    event: reachable,
  };

  const liveRunners = (status: 'PAID' | 'PENDING') =>
    prisma.runner.groupBy({
      by: ['categoryId'],
      // A removed runner is kept for the audit trail, not for the head count.
      where: { deletedAt: null, registration: { status, deletedAt: null }, category: { event: live } },
      _count: { _all: true },
    });

  const [
    liveEvents,
    money,
    totalRegistrants,
    awaitingCount,
    queue,
    recent,
    livePaid,
    livePending,
  ] = await Promise.all([
    prisma.event.findMany({
      where: live,
      orderBy: soonestFirst,
      select: { id: true, title: true, date: true, categories: { select: { id: true, slotLimit: true } } },
    }),
    // Net revenue for the organizer: subtotal + delivery fee, less whatever a
    // promotion took off, and excluding the platform and transaction fees
    // that were never theirs. Every amount is centavos, so the sums are exact
    // integers.
    //
    // The discount has to come off. It is the organizer's own money that was
    // given away — a percentage and a free runner both reduce the goods, not
    // the platform's cut — so a total that ignored it would report revenue the
    // organizer never actually received.
    prisma.registration.aggregate({
      where: paidOrders,
      _sum: { subtotal: true, deliveryFee: true, discountAmount: true, platformFee: true },
    }),
    prisma.runner.count({ where: { deletedAt: null, registration: paidOrders } }),
    prisma.registration.count({ where: awaiting }),
    prisma.registration.findMany({
      where: awaiting,
      // Oldest first: the runner who has waited longest is the next to verify.
      orderBy: { createdAt: 'asc' },
      take: QUEUE_ROWS,
      select: {
        id: true,
        orderRef: true,
        customerName: true,
        totalAmount: true,
        createdAt: true,
        event: { select: { id: true, title: true } },
        _count: { select: { runners: { where: { deletedAt: null } } } },
      },
    }),
    prisma.registration.findMany({
      where: paidOrders,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        orderRef: true,
        customerName: true,
        totalAmount: true,
        createdAt: true,
        event: { select: { id: true, title: true } },
        _count: { select: { runners: { where: { deletedAt: null } } } },
      },
    }),
    liveRunners('PAID'),
    liveRunners('PENDING'),
  ]);

  const sum = money._sum;
  const totalRevenue = (sum.subtotal ?? 0) + (sum.deliveryFee ?? 0) - (sum.discountAmount ?? 0);
  const platformFees = sum.platformFee ?? 0;

  // Per race: the runners on paid and on pending orders, and how full that is
  // when every option has a cap. An option with no cap makes the race
  // unlimited — the same reading fullEventIds gives the public listings — so
  // there is no "full" to measure and the row shows the counts alone.
  const paidBy = new Map(livePaid.map(row => [row.categoryId, row._count._all]));
  const pendingBy = new Map(livePending.map(row => [row.categoryId, row._count._all]));
  const liveRows = liveEvents.map(event => {
    let paid = 0;
    let pending = 0;
    for (const category of event.categories) {
      paid += paidBy.get(category.id) ?? 0;
      pending += pendingBy.get(category.id) ?? 0;
    }
    const capped =
      event.categories.length > 0 && event.categories.every(category => (category.slotLimit ?? 0) > 0);
    const capacity = capped ? event.categories.reduce((n, category) => n + (category.slotLimit ?? 0), 0) : null;
    return { id: event.id, title: event.title, date: event.date, paid, pending, capacity };
  });

  const now = new Date();

  return (
    <>
      <DashboardHeader title="Overview" />

      <div className="admin-content">
        {/* All-time, on purpose (OVERVIEW_PLAN.md): the per-period money lives
            on /admin/remittances. Each tile opens the screen that explains it. */}
        <div className="metrics-grid">
          <Link href={moneyHref} className="metric-card is-link">
            <div className="metric-header">
              <span className="metric-title">Total Revenue (Net)</span>
              <div className="metric-icon"><DollarSign size={20} /></div>
            </div>
            <div className="metric-value">₱{formatPesos(totalRevenue)}</div>
          </Link>

          <Link href="/admin/events" className="metric-card is-link">
            <div className="metric-header">
              <span className="metric-title">Total Registrants</span>
              <div className="metric-icon"><Users size={20} /></div>
            </div>
            <div className="metric-value">{totalRegistrants.toLocaleString('en-US')}</div>
          </Link>

          <Link href="/admin/events" className="metric-card is-link">
            <div className="metric-header">
              <span className="metric-title">Active Events</span>
              <div className="metric-icon"><CalendarDays size={20} /></div>
            </div>
            <div className="metric-value">{liveEvents.length}</div>
          </Link>

          {showPlatformFees && (
            <Link href="/admin/remittances" className="metric-card is-link">
              <div className="metric-header">
                <span className="metric-title">Platform Fees Collected</span>
                <div className="metric-icon"><Landmark size={20} /></div>
              </div>
              <div className="metric-value">₱{formatPesos(platformFees)}</div>
            </Link>
          )}
        </div>

        <div className="overview-stack">
          {/* On a calm morning this is one quiet line, not an empty state:
              most days nothing is waiting, and the page must not grow for it. */}
          {awaitingCount === 0 ? (
            <div className="overview-quiet">
              <CircleCheck size={18} aria-hidden="true" />
              <span>No bank transfers awaiting verification.</span>
            </div>
          ) : (
            <section className="admin-panel" aria-labelledby="overview-awaiting">
              <div className="admin-panel-header">
                <h2 id="overview-awaiting" className="admin-panel-title">
                  Awaiting Verification <span className="overview-count">{awaitingCount}</span>
                </h2>
                {awaitingCount > queue.length && (
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
          )}

          {liveRows.length > 0 && (
            <section className="admin-panel" aria-labelledby="overview-live">
              <div className="admin-panel-header">
                <h2 id="overview-live" className="admin-panel-title">Live Events</h2>
                {liveRows.length > LIVE_ROWS && (
                  <Link href="/admin/events" className="overview-panel-link">
                    All {liveRows.length} <ChevronRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </div>
              <ul className="overview-list">
                {liveRows.slice(0, LIVE_ROWS).map(event => {
                  const taken = event.paid + event.pending;
                  const pct = (n: number) => (event.capacity ? `${Math.min(100, (n / event.capacity) * 100)}%` : '0%');
                  return (
                    <li key={event.id}>
                      <Link href={`/admin/events/${event.id}/registrants`} className="overview-row">
                        <span className="overview-row-main">
                          <span className="overview-row-title">{event.title}</span>
                          <span className="viewer-split-legend">
                            <span className="is-paid">{event.paid.toLocaleString('en-US')} paid</span>
                            <span className="is-pending">{event.pending.toLocaleString('en-US')} pending</span>
                          </span>
                          {event.capacity !== null && (
                            <span className="viewer-split-bar overview-fill" aria-hidden="true">
                              <span className="is-paid" style={{ width: pct(event.paid) }} />
                              <span className="is-pending" style={{ width: pct(event.pending) }} />
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
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

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
        </div>
      </div>
    </>
  );
}
