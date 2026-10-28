import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { HandCoins, Landmark, Scale, Wallet } from 'lucide-react';
import { can, requireTeamActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import { eventSettlement } from '@/lib/settlement-store';
import { formatEventDayShort, today } from '@/lib/event-schedule';
import { SETTLEMENT_STATE_COPY, formatSignedPesos } from '@/lib/settlement';
import AdminNotFound from '../../AdminNotFound';
import SettlementBadge from '../SettlementBadge';
import SettlementClient from './SettlementClient';
import DashboardHeader from '@/app/admin/DashboardHeader';

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
  const changes = settlement.changes;
  const switches = settlement.switches;
  const addOns = settlement.addOns;
  // Either line splits *Collected* into what it is made of.
  const splitCollected = changes.changes > 0 || switches.switches > 0;

  return (
    <>
      <DashboardHeader title={event.title} crumbs={[{ label: 'Remittances', href: '/admin/remittances' }]} />

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
          <Metric
            title="Run As One's Share"
            value={formatSignedPesos(settlement.platformFees)}
            note={addOns.runAsOne > 0 ? `Plus ${formatSignedPesos(addOns.runAsOne)} in Run As One add-on sales` : undefined}
            icon={<Landmark size={20} />}
          />
        </div>

        <div className="admin-panel mb-8">
          <div className="admin-panel-header">
            <h2 className="admin-panel-title">How the Balance Is Worked Out</h2>
          </div>
          <div className="p-4 sm:p-6">
            <p className="text-sm text-secondary mt-0 mb-4">
              Paid orders only ({settlement.paidOrders}). Pending bank transfers count once they are
              validated; refunded and cancelled orders do not count.
              {changes.changes > 0 &&
                ` Category changes count once the runner has moved (${changes.changes}); an upgrade still
                waiting for its payment does not.`}
              {switches.switches > 0 &&
                ` Delivery switches count once paid and applied (${switches.switches}); one still waiting for
                payment, cancelled or expired does not.`}
            </p>
            <dl className="settlement-lines">
              <Line label="Collected from runners" value={settlement.collected} strong />
              {/* The Category changes line (CATEGORY_CHANGE_PLAN.md): only when
                  there are any, so a race without one reads as it always has. */}
              {splitCollected && (
                <Line label="Paid on orders" value={settlement.collected - changes.collected - switches.charged} muted />
              )}
              {changes.changes > 0 && (
                <>
                  <Line label="Paid for category changes" value={changes.charged} muted />
                  {changes.refunded > 0 && (
                    <Line label="Less category change refunds paid" value={-changes.refunded} muted />
                  )}
                  {changes.toRefund > 0 && (
                    <Line label="Less category change refunds still to refund" value={-changes.toRefund} muted />
                  )}
                </>
              )}
              {/* The Delivery switches line (LOGISTICS_CHANGE_PLAN.md L8): the
                  receipt is never edited, so its fee is named here instead. */}
              {switches.switches > 0 && <Line label="Paid for delivery switches" value={switches.charged} muted />}
              {/* Add-ons (ADD_ONS_PLAN.md D1): inside what orders paid, named
                  so staff see the item money apart from the entries. */}
              {addOns.sales > 0 && <Line label="Of which add-on sales" value={addOns.sales} muted />}
              <Line
                label={changes.changeFees > 0 ? 'Platform and change fees (Run As One)' : 'Platform fees (Run As One)'}
                value={-settlement.platformFees}
              />
              {/* Run As One's own merchandise: kept, so off what is owed, and
                  never inside the platform fee line above (D1, D2). */}
              {addOns.runAsOne > 0 && <Line label="Add-ons sold by Run As One" value={-addOns.runAsOne} />}
              <Line label="Payment processing fees (PayMongo)" value={-settlement.transactionFees} />
              <Line label="Owed to the organizer" value={settlement.owed} strong rule />
              <Line label="Race entries at list price" value={parts.entries} muted />
              <Line label="Less discounts from promotions" value={-parts.discounts} muted />
              {addOns.organizer > 0 && <Line label="Add-ons sold by the organizer" value={addOns.organizer} muted />}
              <Line label="Delivery fees" value={parts.delivery} muted />
              {changes.changes > 0 && (
                <Line label="Category changes, after their fees and refunds" value={changes.owed} muted />
              )}
              {switches.switches > 0 && <Line label="Delivery switches" value={switches.owed} muted />}
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
