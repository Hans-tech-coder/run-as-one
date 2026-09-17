import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, HandCoins, Landmark, Scale, Wallet } from 'lucide-react';
import { can, requireTeamActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import { eventSettlement } from '@/lib/settlement-store';
import { formatEventDayShort, today } from '@/lib/event-schedule';
import { SETTLEMENT_STATE_COPY, formatSignedPesos } from '@/lib/settlement';
import AdminNotFound from '../../AdminNotFound';
import SettlementBadge from '../SettlementBadge';
import SettlementClient from './SettlementClient';

export const metadata: Metadata = {
  title: `Settlement | ${SITE_NAME} Admin`,
};

/** A missing race and one this person may not settle read alike (PROJECT_GUIDE §7). */
const SETTLEMENT_NOT_FOUND = {
  title: 'Event Not Found',
  heading: 'Event not found.',
  body: 'The link may be an old one, or the event may have been deleted. The other settlements are where you left them.',
  homeHref: '/admin/remittances',
  homeLabel: 'Back to Remittances',
};

/**
 * One race's settlement with its organizer (ADMIN_MERGE_PLAN.md, Batch 6):
 * what is owed, what was remitted, the balance, how the figures are made, and
 * every remittance ever recorded — voided ones included, struck through with
 * who voided them and why.
 *
 * The figures are summed here on the server (settlement-store.ts); recording
 * and voiding are the client half, which refreshes this page when it is done
 * so the balance is read again rather than patched in the browser.
 */
export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const actor = await requireTeamActor();
  if (!can(actor, 'remittance:manage', { organizerId: actor.orgId })) {
    notFound();
  }

  const { eventId } = await params;
  const detail = await eventSettlement(actor, eventId);
  if (!detail) {
    return <AdminNotFound {...SETTLEMENT_NOT_FOUND} />;
  }

  const { event, settlement, parts, remittances } = detail;

  return (
    <>
      <header className="admin-header">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/admin/remittances"
            className="admin-back-link text-secondary hover:text-primary transition-colors"
            aria-label="Back to Remittances"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="admin-header-title truncate">{event.title}</h1>
        </div>
      </header>

      <div className="admin-content">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-6 text-sm text-secondary">
          <SettlementBadge state={settlement.state} />
          <span>{formatEventDayShort(event.date)}</span>
          <span aria-hidden="true">·</span>
          <span className="[overflow-wrap:anywhere]">
            {event.clientName ? `For ${event.clientName}` : 'No client linked yet'}
          </span>
        </div>

        <div className="metrics-grid">
          <Metric title="Owed to Organizer" value={formatSignedPesos(settlement.owed)} icon={<Wallet size={20} />} />
          <Metric title="Remitted" value={formatSignedPesos(settlement.remitted)} icon={<HandCoins size={20} />} />
          <Metric
            title={settlement.balance < 0 ? 'Balance (Overpaid)' : 'Balance'}
            value={formatSignedPesos(settlement.balance)}
            note={SETTLEMENT_STATE_COPY[settlement.state].hint}
            icon={<Scale size={20} />}
          />
          <Metric title="Run As One's Share" value={formatSignedPesos(settlement.share)} icon={<Landmark size={20} />} />
        </div>

        <div className="admin-panel mb-8">
          <div className="admin-panel-header">
            <h2 className="admin-panel-title">How the Balance Is Worked Out</h2>
          </div>
          <div className="p-4 sm:p-6">
            <p className="text-sm text-secondary mt-0 mb-4">
              Paid orders only ({settlement.paidOrders}). Pending bank transfers count once they are
              validated; refunded and cancelled orders do not count.
            </p>
            <dl className="settlement-lines">
              <Line label="Collected from runners" value={settlement.collected} strong />
              <Line label="Platform fees (Run As One)" value={-settlement.platformFees} />
              <Line label="Transaction fees (Run As One)" value={-settlement.transactionFees} />
              <Line label="Owed to the organizer" value={settlement.owed} strong rule />
              <Line label="Race entries at list price" value={parts.entries} muted />
              <Line label="Less discounts from promotions" value={-parts.discounts} muted />
              <Line label="Delivery fees" value={parts.delivery} muted />
              <Line label="Remitted so far (payouts less returns)" value={-settlement.remitted} rule />
              <Line label="Balance" value={settlement.balance} strong rule />
            </dl>
          </div>
        </div>

        <SettlementClient
          eventId={event.id}
          eventTitle={event.title}
          balance={settlement.balance}
          today={today()}
          remittances={remittances}
        />
      </div>
    </>
  );
}

function Metric({
  title,
  value,
  note,
  icon,
}: {
  title: string;
  value: string;
  note?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        <div className="metric-icon">{icon}</div>
      </div>
      <div className="metric-value">{value}</div>
      {note && <p className="m-0 -mt-2 text-xs text-secondary">{note}</p>}
    </div>
  );
}

/** One line of the breakdown. `muted` lines explain the one above them rather than adding to it. */
function Line({
  label,
  value,
  strong,
  muted,
  rule,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
  rule?: boolean;
}) {
  return (
    <div className={`settlement-line${rule ? ' has-rule' : ''}${muted ? ' is-muted' : ''}${strong ? ' is-strong' : ''}`}>
      <dt>{label}</dt>
      <dd>{formatSignedPesos(value)}</dd>
    </div>
  );
}
