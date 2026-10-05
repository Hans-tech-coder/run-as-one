/**
 * The Unpaid checkouts table's columns, and the two cells its phone cards
 * reuse (UNPAID_FOLLOWUP_PLAN.md Batch 1). Split out of
 * `UnpaidCheckoutsList.tsx` the way `registrant-columns.tsx` is out of the
 * registrants table, so the list keeps only its state, filters and layout.
 * The row's menu is passed in, because it needs the list's modal.
 */

import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { selectionColumn } from './registrant-columns';
import { FollowUpSummary } from './FollowUpModal';
import { formatPesos } from '@/lib/money';
import type { UnpaidCheckout } from './UnpaidCheckoutsList';

const STATUS_BADGES: Record<UnpaidCheckout['status'], { label: string; tone: string }> = {
  PENDING: { label: 'Awaiting payment', tone: 'pending' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export function UnpaidStatus({ order }: { order: UnpaidCheckout }) {
  const badge = STATUS_BADGES[order.status];
  return (
    <span className="flex flex-col items-start gap-1">
      <span className={`status-badge whitespace-nowrap ${badge.tone}`}>{badge.label}</span>
      {order.statusDetail && (
        <span className="text-xs text-[var(--text-muted)]">{order.statusDetail}</span>
      )}
      {/* Why it was closed, from the trail line Cancel order… wrote. */}
      {order.cancelReason && (
        <span className="block max-w-[14rem] text-xs text-secondary [overflow-wrap:anywhere]">{order.cancelReason}</span>
      )}
    </span>
  );
}

export const runnerCount = (order: UnpaidCheckout) =>
  `${order.runnerNames.length} ${order.runnerNames.length === 1 ? 'runner' : 'runners'}`;

export function unpaidColumns(
  actions: (order: UnpaidCheckout) => React.ReactNode,
): ColumnDef<UnpaidCheckout>[] {
  return [
    selectionColumn<UnpaidCheckout>(),
    {
      id: 'index',
      header: 'No.',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <span className="text-secondary font-mono">{row.original.listNo}</span>,
    },
    {
      // Sorted by when the order was made, the line under the reference.
      id: 'order',
      accessorFn: order => order.createdAt,
      header: 'Order',
      cell: ({ row }) => (
        <>
          <span className="block whitespace-nowrap font-mono">{row.original.orderRef}</span>
          <span className="block whitespace-nowrap text-xs text-[var(--text-muted)]">{row.original.createdLabel}</span>
        </>
      ),
    },
    {
      id: 'runners',
      accessorFn: order => order.runnerNames.length,
      header: 'Runners',
      cell: ({ row }) => (
        <div className="min-w-[8rem] max-w-[16rem]">
          <span className="block text-xs text-[var(--text-muted)]">{runnerCount(row.original)}</span>
          {/* Wrapped, not truncated: a truncated name sets the column's
              narrowest width to the whole name. */}
          {row.original.runnerNames.map((name, i) => (
            <span key={i} className="block [overflow-wrap:anywhere]">{name}</span>
          ))}
        </div>
      ),
    },
    {
      id: 'contact',
      accessorFn: order => order.contactEmail,
      header: 'Contact',
      cell: ({ row }) => (
        <div className="max-w-[16rem]">
          {/* Allowed to break anywhere, as the registrants table's email is:
              left whole, a long address set the column's narrowest width
              and pushed the table into a sideways scroll. */}
          <span className="block [overflow-wrap:anywhere]">{row.original.contactEmail}</span>
          <span className="block text-secondary">{row.original.contactPhone}</span>
        </div>
      ),
    },
    {
      // Sorted by the amount, the figure staff compare.
      id: 'payment',
      accessorFn: order => order.totalAmount,
      header: 'Payment',
      cell: ({ row }) => (
        <>
          <span className="block">{row.original.paymentMethod}</span>
          <span className="block text-secondary tabular-nums">₱{formatPesos(row.original.totalAmount)}</span>
        </>
      ),
    },
    {
      // Awaiting payment, then expired, then cancelled, ascending.
      id: 'status',
      accessorFn: order => ['PENDING', 'EXPIRED', 'CANCELLED'].indexOf(order.status),
      header: 'Status',
      cell: ({ row }) => <UnpaidStatus order={row.original} />,
    },
    {
      // Sorted by when it was last logged; never-contacted orders first.
      id: 'followUp',
      accessorFn: order => order.followUp?.at ?? '',
      header: 'Follow-up',
      cell: ({ row }) => <FollowUpSummary followUp={row.original.followUp} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => actions(row.original),
    },
  ];
}
