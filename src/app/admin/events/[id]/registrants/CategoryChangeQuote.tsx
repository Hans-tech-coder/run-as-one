"use client";

/**
 * The quote panel of Change category (`CategoryChangeModal.tsx`): the move,
 * what the runner is taken to have paid and what it stands on (D3), the new
 * price, the fee, and what the change comes to — to pay, with the transaction
 * fee on top once staff pick an online payment (D13), to refund, or kept under
 * the race's policy. Split out of the modal when the upgrade's payment choice
 * arrived (Session 3), so neither file is past the size the repository splits
 * files at.
 */

import React from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { formatPesos } from '@/lib/money';
import {
  BASIS_ESTIMATE_COPY,
  CATEGORY_CHANGE_STATUSES,
  DOWNGRADE_REFUND_POLICIES,
  type CategoryChangeQuote as Quote,
} from '@/lib/category-change';
import type { CategoryChangePreview } from '@/lib/category-change-context';
import { kitSummary } from './category-change-display';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

/** One labelled money line of the quote. */
export function QuoteLine({ label, value, note }: { label: React.ReactNode; value: string; note?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-secondary">
        {label}
        {note && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{note}</span>}
      </span>
      <span className="text-primary font-medium tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

type Category = CategoryChangePreview['categories'][number];

export default function CategoryChangeQuote({
  quote,
  preview,
  current,
  target,
  kit,
  policy,
  pendingBasis,
  announce,
}: {
  quote: Quote;
  preview: CategoryChangePreview;
  current: Category;
  target: Category;
  kit: { added: string[]; removed: string[]; changed: boolean } | null;
  policy: string | null;
  pendingBasis: number | null;
  announce: string;
}) {
  const needsPayment = quote.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT;
  return (
    <section aria-labelledby="category-change-quote" className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-sunken)] p-4">
      <h4 id="category-change-quote" className="m-0 mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
        {current.name} <ArrowRight size={14} aria-hidden="true" /> {target.name}
      </h4>

      <QuoteLine
        label={
          <>
            Already paid for {current.name}
            {quote.basisEstimated && (
              <span className="status-badge pending ml-2 align-middle" style={{ padding: '1px 8px' }}>Estimated</span>
            )}
          </>
        }
        value={peso(quote.basis)}
        note={
          pendingBasis !== null
            ? `${peso(pendingBasis)} entered; it applies once you say why it differs.`
            : quote.basisAdjustReason
              ? `Adjusted from ${peso(quote.computedBasis)}: ${quote.basisAdjustReason}`
              : `Order ${preview.order.orderRef} total: ${peso(preview.order.totalAmount)}${
                  preview.order.runnerCount > 1 ? ` for ${preview.order.runnerCount} runners` : ''
                }`
        }
      />
      {quote.estimateReason && (
        <p className="m-0 mb-1 flex gap-2 text-xs text-[var(--status-warning)]">
          <Info size={14} className="shrink-0 mt-px" aria-hidden="true" />
          {BASIS_ESTIMATE_COPY[quote.estimateReason]}
        </p>
      )}
      <QuoteLine label={`${target.name} list price`} value={peso(quote.toPrice)} />
      {quote.changeFee > 0 && <QuoteLine label="Change fee" value={peso(quote.changeFee)} />}
      {needsPayment && quote.transactionFee > 0 && (
        <QuoteLine label="Transaction fee" value={peso(quote.transactionFee)} note="PayMongo's, paid by the runner on top" />
      )}
      <div className="my-1.5 border-t border-[var(--dash-border)]" />
      {needsPayment ? (
        <QuoteLine label={<span className="font-semibold text-primary">Runner pays</span>} value={peso(quote.totalCharged)} />
      ) : quote.refundAmount > 0 ? (
        <QuoteLine
          label={<span className="font-semibold text-primary">Refund due</span>}
          value={peso(quote.refundAmount)}
          note="Paid by hand by GCash or bank, then recorded from the runner's details."
        />
      ) : quote.forfeited > 0 ? (
        <QuoteLine
          label={<span className="font-semibold text-primary">Not refunded</span>}
          value={peso(quote.forfeited)}
          note="This race does not refund a move to a cheaper category."
        />
      ) : (
        <QuoteLine label={<span className="font-semibold text-primary">Nothing to pay</span>} value={peso(0)} />
      )}
      <p className="sr-only" aria-live="polite">{announce}</p>

      <p className="m-0 mt-2 text-xs text-secondary">
        {kit?.changed ? <>Kit changes: {kitSummary(kit)}.</> : 'Same race kit.'}
        {quote.direction === 'DOWNGRADE' && policy === DOWNGRADE_REFUND_POLICIES.REFUND_DIFFERENCE
          ? ' This race refunds the difference on a downgrade.'
          : ''}
      </p>
    </section>
  );
}
