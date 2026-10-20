import React from 'react';
import Link from 'next/link';
import { DollarSign, Users, CalendarDays, Landmark } from 'lucide-react';
import prisma from '@/lib/db';
import { can, isClientViewer, requireActor } from '@/lib/actor';
import { totalCounts, viewerEventSummaries } from '@/lib/client-summary';
import { formatPesos } from '@/lib/money';
import ViewerDashboard from './ViewerDashboard';
import DashboardHeader from './DashboardHeader';
import { loadOverview } from './overview-data';
import { AwaitingPanel, LiveEventsPanel, RecentPanel } from './OverviewPanels';

/**
 * Run As One's front page (OVERVIEW_PLAN.md, Batch 1): the morning question —
 * what is waiting on us, and how is each race filling — above the all-time
 * numbers, in four blocks and no more. The owner asked for both the work queue
 * and the numbers but not a long page, so a block that is merely interesting
 * does not belong here.
 *
 * The figures are read in `overview-data.ts`, every one counted by the
 * database; the three lists below the tiles are `OverviewPanels.tsx`.
 */

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

  const overview = await loadOverview(actor);
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
            <div className="metric-value">₱{formatPesos(overview.totalRevenue)}</div>
          </Link>

          <Link href="/admin/events" className="metric-card is-link">
            <div className="metric-header">
              <span className="metric-title">Total Registrants</span>
              <div className="metric-icon"><Users size={20} /></div>
            </div>
            <div className="metric-value">{overview.totalRegistrants.toLocaleString('en-US')}</div>
          </Link>

          <Link href="/admin/events" className="metric-card is-link">
            <div className="metric-header">
              <span className="metric-title">Active Events</span>
              <div className="metric-icon"><CalendarDays size={20} /></div>
            </div>
            <div className="metric-value">{overview.liveRows.length}</div>
          </Link>

          {showPlatformFees && (
            <Link href="/admin/remittances" className="metric-card is-link">
              <div className="metric-header">
                <span className="metric-title">Platform Fees Collected</span>
                <div className="metric-icon"><Landmark size={20} /></div>
              </div>
              <div className="metric-value">₱{formatPesos(overview.platformFees)}</div>
            </Link>
          )}
        </div>

        <div className="overview-stack">
          <AwaitingPanel count={overview.awaitingCount} queue={overview.queue} now={now} />
          <LiveEventsPanel rows={overview.liveRows} />
          <RecentPanel recent={overview.recent} canCreate={canCreate} />
        </div>
      </div>
    </>
  );
}
