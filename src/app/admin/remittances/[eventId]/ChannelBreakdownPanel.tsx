import React from 'react';
import Link from 'next/link';
import { formatSignedPesos } from '@/lib/settlement';
import type { ChannelBreakdown, ChannelLine } from '@/lib/settlement-channels';

/**
 * **Collected by channel** (PAYMENT_CHANNELS_PLAN.md Batch 4): where the money
 * the settlement below counts came in — each account by name, PayMongo with
 * its fees and net, *Untagged* — then refunds as a line of their own (D5),
 * landing on the same *Collected from runners* the breakdown starts from
 * (D7). Bank transfers nobody has validated are listed under it, outside
 * every total (D6). A server component: the figures come from the page's own
 * read (`settlement-store.ts`), nothing is fetched here.
 */
export default function ChannelBreakdownPanel({
  eventId,
  breakdown,
}: {
  eventId: string;
  breakdown: ChannelBreakdown;
}) {
  const { lines, awaiting } = breakdown;
  const nothing = lines.length === 0 && awaiting.length === 0;
  const untagged = lines.find(line => line.channel.kind === 'UNTAGGED');
  // With the *Paid to* filter on Untagged (Batch 5), so the link lands on the
  // orders still to tag rather than on every runner.
  const registrantsHref = `/admin/events/${eventId}/registrants?paidTo=untagged`;

  return (
    <div className="admin-panel mb-8">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Collected by Channel</h2>
      </div>
      <div className="p-4 sm:p-6">
        {nothing ? (
          <p className="text-sm text-secondary m-0">No payments have come in for this event yet.</p>
        ) : (
          <>
            <p className="text-sm text-secondary mt-0 mb-4">
              Where the payments counted below came in, by account. PayMongo&apos;s GCash and card payments are
              PayMongo&apos;s, not a wallet&apos;s. Refunds are one line of their own, never taken off an account.
            </p>
            <dl className="settlement-lines">
              {lines.map(line => (
                <React.Fragment key={line.channel.key}>
                  <ChannelRow line={line} />
                  {line.channel.kind === 'PAYMONGO' && line.fees > 0 && (
                    <>
                      <Row label="Less PayMongo fees" value={-line.fees} muted />
                      <Row label="PayMongo net" value={line.net} muted />
                    </>
                  )}
                </React.Fragment>
              ))}
              <Row label="Total received" value={breakdown.gross} rule />
              {breakdown.refunds > 0 && <Row label="Less refunds to runners" value={-breakdown.refunds} />}
              <Row label="Collected from runners" value={breakdown.collected} strong rule />
            </dl>

            {untagged && (
              <p className="text-xs text-secondary mt-3 mb-0">
                {untagged.count === 1 ? '1 bank transfer has' : `${untagged.count} bank transfers have`} no account
                recorded.{' '}
                <Link href={registrantsHref} className="font-medium text-primary underline underline-offset-2">
                  Tag them in Registrants
                </Link>{' '}
                from each proof of payment.
              </p>
            )}

            {!breakdown.tiesOut && (
              <p role="status" className="text-sm font-medium mt-3 mb-0 text-[var(--status-danger)]">
                These channel totals do not match the settlement below. Remit by the settlement figures and report
                this event.
              </p>
            )}

            {awaiting.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-primary m-0">Awaiting Validation</h3>
                <p className="text-xs text-secondary mt-1 mb-2">
                  Proof sent, not yet checked. Not counted in any figure on this page until validated.
                </p>
                <dl className="settlement-lines">
                  {awaiting.map(line => (
                    <Row
                      key={line.channel.key}
                      label={line.channel.label}
                      count={line.count}
                      value={line.amount}
                      muted
                    />
                  ))}
                </dl>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChannelRow({ line }: { line: ChannelLine }) {
  const label = line.channel.kind === 'UNTAGGED' ? 'Untagged bank transfers' : line.channel.label;
  return <Row label={label} count={line.count} value={line.gross} />;
}

/** One line, the remittance breakdown's own look (`.settlement-line`). */
function Row({
  label,
  value,
  count,
  strong,
  muted,
  rule,
}: {
  label: string;
  value: number;
  count?: number;
  strong?: boolean;
  muted?: boolean;
  rule?: boolean;
}) {
  return (
    <div className={`settlement-line${rule ? ' has-rule' : ''}${muted ? ' is-muted' : ''}${strong ? ' is-strong' : ''}`}>
      <dt className="[overflow-wrap:anywhere]">
        {label}
        {count !== undefined && (
          <span className="text-secondary font-normal">
            {' '}
            · {count} {count === 1 ? 'payment' : 'payments'}
          </span>
        )}
      </dt>
      <dd>{formatSignedPesos(value)}</dd>
    </div>
  );
}
