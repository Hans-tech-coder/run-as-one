"use client";

/**
 * The Unpaid checkouts tab as cards, under 60rem, where the table does not
 * fit (PROJECT_GUIDE §8 rule 12). Split out of `UnpaidCheckoutsList.tsx`
 * (UNPAID_FOLLOWUP_PLAN.md Batch 4). The same rows as the table: search,
 * filters, sort, marks and the page all come from the one table instance the
 * list owns, so the two views can never show different orders.
 */

import React from 'react';
import type { Table } from '@tanstack/react-table';
import AdminCardList from '../../../AdminCardList';
import { UnpaidStatus, runnerCount } from './unpaid-columns';
import { FollowUpSummary } from './FollowUpModal';
import { formatPesos } from '@/lib/money';
import type { UnpaidCheckout } from './UnpaidCheckoutsList';

export default function UnpaidCheckoutCards({
  table,
  actions,
  empty,
}: {
  table: Table<UnpaidCheckout>;
  /** The row's ⋮ menu, placed at the card's end. */
  actions: (order: UnpaidCheckout) => React.ReactNode;
  empty: React.ReactNode;
}) {
  return (
    <AdminCardList
      items={table.getRowModel().rows}
      getKey={row => row.id}
      label="Unpaid checkouts"
      className="is-flush"
      selection={{
        isSelected: row => row.getIsSelected(),
        toggle: row => row.toggleSelected(),
        label: row => `Select ${row.original.orderRef}`,
      }}
      selectAll={{
        checked: table.getIsAllPageRowsSelected(),
        toggle: () => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected()),
        label: `Select all ${table.getRowModel().rows.length} on this page`,
      }}
      leading={row => <span className="font-mono">{row.original.listNo}</span>}
      title={row => <span className="block truncate">{row.original.contactName}</span>}
      subtitle={row => (
        <>
          <span className="block font-mono">{row.original.orderRef}</span>
          <span className="block text-xs">{row.original.createdLabel}</span>
        </>
      )}
      badges={row => <UnpaidStatus order={row.original} />}
      fields={row => [
        { label: 'Runners', value: `${runnerCount(row.original)}: ${row.original.runnerNames.join(', ')}`, full: true },
        { label: 'Email', value: <span className="break-all">{row.original.contactEmail}</span>, full: true },
        { label: 'Phone', value: row.original.contactPhone },
        { label: 'Payment', value: row.original.paymentMethod },
        { label: 'Amount', value: `₱${formatPesos(row.original.totalAmount)}` },
        { label: 'Follow-up', value: <FollowUpSummary followUp={row.original.followUp} />, full: true },
      ]}
      actions={row => actions(row.original)}
      empty={empty}
    />
  );
}
