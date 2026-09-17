import React from 'react';
import { DollarSign, Users, CalendarDays, Landmark } from 'lucide-react';
import prisma from '@/lib/db';
import { can, reachableEvents, requireActor } from '@/lib/actor';
import { formatPesos } from '@/lib/money';
import { hasFinished, today } from '@/lib/event-schedule';
import AdminCardList from './AdminCardList';

export default async function AdminDashboard() {
  const actor = await requireActor();

  // Run As One's own number, beside the organizer-facing three: the per-runner
  // admin fees it has collected. It was the super admin dashboard's
  // "Platform Revenue" tile; with one dashboard (ADMIN_MERGE_PLAN.md, Batch 2)
  // it is shown to whoever runs the platform (owner and admin) and to nobody
  // working a single race. The loading skeleton counts the same tiles
  // (route-loading-shape.ts, OVERVIEW_PLATFORM_METRICS).
  const showPlatformFees = can(actor, 'platform:manage', { organizerId: actor.orgId });

  const activeAsOf = today();

  // The races this person may read registrations on — every event of the
  // organizer for its owner, only the assigned ones for a STAFF member.
  const events = await prisma.event.findMany({
    where: reachableEvents(actor, 'registration:view'),
    include: {
      registrations: {
        where: { status: 'PAID' },
        // A removed runner is kept for the audit trail, not for the head count.
        include: { runners: { where: { deletedAt: null } } }
      }
    }
  });

  // Races the organizer still has ahead of them, race day itself included —
  // the same line the public listings draw, so the tile and /events can never
  // disagree about which races are still live. See src/lib/event-schedule.ts.
  // A single reading of "today" is shared, so an event cannot be counted
  // differently by two calls that straddle midnight in Manila.
  const activeEventsCount = events.filter(
    event => !hasFinished(event, activeAsOf)
  ).length;

  let totalRevenue = 0;
  let totalRegistrants = 0;
  let platformFees = 0;

  const recentRegistrations: ((typeof events)[number]['registrations'][number] & { eventTitle: string })[] = [];

  events.forEach(event => {
    event.registrations.forEach(reg => {
      // Net revenue for the organizer: subtotal + delivery fee, less whatever a
      // promotion took off, and excluding the platform and transaction fees
      // that were never theirs. Every amount is centavos, so the running total
      // stays an exact integer.
      //
      // The discount has to come off here. It is the organizer's own money that
      // was given away — a percentage and a free runner both reduce the goods,
      // not the platform's cut — so a total that ignored it would report
      // revenue the organizer never actually received.
      totalRevenue += (reg.subtotal + reg.deliveryFee - reg.discountAmount);
      totalRegistrants += reg.runners.length;
      platformFees += reg.platformFee;

      recentRegistrations.push({
        ...reg,
        eventTitle: event.title
      });
    });
  });

  // Sort recent registrations descending by date
  recentRegistrations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestFive = recentRegistrations.slice(0, 5);

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Overview</h1>
      </header>

      <div className="admin-content">
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Revenue (Net)</span>
              <div className="metric-icon"><DollarSign size={20} /></div>
            </div>
            <div className="metric-value">₱{formatPesos(totalRevenue)}</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Registrants</span>
              <div className="metric-icon"><Users size={20} /></div>
            </div>
            <div className="metric-value">{totalRegistrants}</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Active Events</span>
              <div className="metric-icon"><CalendarDays size={20} /></div>
            </div>
            <div className="metric-value">{activeEventsCount}</div>
          </div>

          {showPlatformFees && (
            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">Platform Fees Collected</span>
                <div className="metric-icon"><Landmark size={20} /></div>
              </div>
              <div className="metric-value">₱{formatPesos(platformFees)}</div>
            </div>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-panel-header">
            <h2 className="admin-panel-title">Recent Registrations</h2>
          </div>

          {latestFive.length === 0 ? (
            <div className="empty-state">
              <Users size={48} className="empty-icon" />
              <p>No registrations yet. Publish an event to get started.</p>
            </div>
          ) : (
            <>
            {/* The table from lg up, the same five as cards below it — Admin.css
                decides which is seen, so the first paint is already right. */}
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
                  {latestFive.map(reg => (
                    <tr key={reg.id}>
                      <td>{reg.orderRef}</td>
                      <td>{reg.customerName}</td>
                      <td>{reg.eventTitle}</td>
                      <td>₱{formatPesos(reg.totalAmount)}</td>
                      <td>{reg.runners.length}</td>
                      <td>{new Date(reg.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dash-mobile-only">
              <AdminCardList
                label="Recent registrations"
                items={latestFive}
                getKey={reg => reg.id}
                title={reg => reg.customerName}
                subtitle={reg => reg.orderRef}
                fields={reg => [
                  { label: 'Event', value: reg.eventTitle, full: true },
                  { label: 'Amount', value: `₱${formatPesos(reg.totalAmount)}` },
                  { label: 'Runners', value: reg.runners.length },
                  { label: 'Date', value: new Date(reg.createdAt).toLocaleDateString() },
                ]}
              />
            </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
