"use client";

/**
 * Pickup & Delivery's table from `lg` up (§9 "One admin table"): No., Receipt
 * (with its kit count), Runners, Logistics, Ships to and Actions, one row per receipt. A row
 * with a switch waiting or a history opens in place (`renderSubRow` in
 * `PickupDeliveryClient.tsx`). What a row reads that changes while the screen is open —
 * which row is open, which switch is being cancelled — comes from the table's
 * `meta`, so the column list is built once.
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { rowPosition } from '@/app/admin/AdminDataTable';
import { paymentMethodLabel } from '@/lib/registration-codes';
import type { Receipt } from '@/lib/logistics-receipts';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { openSwitch } from '../registrants/logistics-change-display';
import { ReceiptAction, ReceiptBadges, shipsToLines } from './receipt-display';

export type PickupDeliveryTableMeta = {
  openId: string | null;
  canEdit: boolean;
  cancellingId: string | null;
  onSwitch: (receipt: Receipt) => void;
  onCancel: (change: LogisticsChangeView) => void;
};

/** Whether a row has anything to open: a waiting switch or a history. */
export function opens(receipt: Receipt): boolean {
  return receipt.logisticsChanges.length > 0;
}

export const RECEIPT_COLUMNS: ColumnDef<Receipt>[] = [
  {
    id: 'no',
    header: 'No.',
    cell: ({ row, table }) => (
      <span className="text-secondary font-mono">{rowPosition(table.getSortedRowModel().flatRows, row)}</span>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'receipt',
    header: 'Receipt',
    accessorFn: receipt => receipt.orderRef,
    cell: ({ row, table }) => {
      const { openId } = table.options.meta as PickupDeliveryTableMeta;
      const receipt = row.original;
      return (
        <div className="flex items-start gap-2 whitespace-nowrap">
          {opens(receipt) && (
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`mt-0.5 shrink-0 text-secondary transition-transform duration-200 ${openId === receipt.id ? 'rotate-180' : ''}`}
            />
          )}
          <div>
            <div className="font-mono font-semibold">{receipt.orderRef}</div>
            <div className="text-xs text-secondary">
              {receipt.runners.length} {receipt.runners.length === 1 ? 'kit' : 'kits'} &middot;{' '}
              {paymentMethodLabel(receipt.paymentMethod)}
            </div>
          </div>
        </div>
      );
    },
    enableHiding: false,
  },
  {
    id: 'runners',
    header: 'Runners',
    accessorFn: receipt => receipt.runners[0]?.name ?? '',
    cell: ({ row }) => (
      <ul className="m-0 p-0 list-none space-y-1 min-w-[140px] max-w-[220px]">
        {row.original.runners.map(runner => (
          <li key={runner.id} className="[overflow-wrap:anywhere]">
            <span className="font-medium">{runner.name}</span>
            {runner.category && <span className="text-secondary"> &middot; {runner.category}</span>}
            <span className="block text-xs text-[var(--text-muted)]">{runner.email}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: 'logistics',
    header: 'Logistics',
    accessorFn: receipt => `${receipt.logisticsMethod}${openSwitch(receipt) ? ' waiting' : ''}`,
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <ReceiptBadges receipt={row.original} />
      </div>
    ),
  },
  {
    id: 'shipsTo',
    header: 'Ships to',
    accessorFn: receipt => receipt.parcels[0]?.address ?? '',
    cell: ({ row }) => {
      const lines = shipsToLines(row.original);
      if (lines.length === 0) return <span className="text-[var(--text-muted)]">Pickup</span>;
      return (
        <dl className="m-0 space-y-1.5 min-w-[150px] max-w-[260px]">
          {lines.map((line, index) => (
            <div key={index} className="[overflow-wrap:anywhere]">
              <dt className="text-xs text-secondary">{line.label}</dt>
              <dd className="m-0">{line.value}</dd>
            </div>
          ))}
        </dl>
      );
    },
  },
  {
    // Under its own header label, never pushed to the row's right edge.
    id: 'actions',
    header: 'Actions',
    cell: ({ row, table }) => {
      const { canEdit, cancellingId, onSwitch, onCancel } = table.options.meta as PickupDeliveryTableMeta;
      const receipt = row.original;
      return (
        <ReceiptAction
          receipt={receipt}
          canEdit={canEdit}
          cancelling={cancellingId === openSwitch(receipt)?.id}
          onSwitch={() => onSwitch(receipt)}
          onCancel={onCancel}
        />
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];
