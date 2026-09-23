import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Banknote, HandCoins, Landmark, Scale } from 'lucide-react';
import { can, requireTeamActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import { eventSettlements } from '@/lib/settlement-store';
import { formatSignedPesos } from '@/lib/settlement';
import RemittancesClient from './RemittancesClient';
import DashboardHeader from '@/app/admin/DashboardHeader';

export const metadata: Metadata = {
  title: `Remittances | ${SITE_NAME} Admin`,
};

/**
 * What Run As One owes each race's organizer, and what it has paid
 * (ADMIN_MERGE_PLAN.md, Batch 6).
 *
 * A server page: every figure is summed from the PAID registrations as the page
 * is asked for (settlement-store.ts), so there is nothing for the browser to
 * fetch and nothing stored that could fall out of step. The search and the
 * chips are the client half. A row opens the race's own settlement, where a
 * payout is recorded.
 *
 * `remittance:manage` (owner and admin); anyone else on the team gets the
 * admin's 404, and a client viewer the forbidden page before anything is read.
 */
export default async function Page() {
  const actor = await requireTeamActor();
  if (!can(actor, 'remittance:manage', { organizerId: actor.orgId })) {
    notFound();
  }

  const rows = await eventSettlements(actor);

  // "Balance due" adds only the races still owed. Netting one race's
  // overpayment against another's debt would hide both: the organizer of the
  // second race is still waiting, whatever the first one received.
  let collected = 0;
  let share = 0;
  let due = 0;
  let remitted = 0;
  for (const { settlement } of rows) {
    collected += settlement.collected;
    share += settlement.share;
    remitted += settlement.remitted;
    if (settlement.balance > 0) due += settlement.balance;
  }

  return (
    <>
      <DashboardHeader title="Remittances" />

      <div className="admin-content">
        <div className="metrics-grid">
          <Metric title="Collected (Paid Orders)" value={formatSignedPesos(collected)} icon={<Banknote size={20} />} />
          <Metric title="Run As One's Share" value={formatSignedPesos(share)} icon={<Landmark size={20} />} />
          <Metric title="Balance Due to Organizers" value={formatSignedPesos(due)} icon={<Scale size={20} />} />
          <Metric title="Remitted" value={formatSignedPesos(remitted)} icon={<HandCoins size={20} />} />
        </div>

        <RemittancesClient rows={rows} />
      </div>
    </>
  );
}

function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        <div className="metric-icon">{icon}</div>
      </div>
      <div className="metric-value">{value}</div>
    </div>
  );
}
