"use client";

/**
 * The Unpaid checkouts tab (UNPAID_ORDERS_PLAN.md Batch 3): online orders that
 * were opened and never paid, one row per order, for staff to follow up by
 * hand.
 *
 * **Read-only, and kept apart from the registrants.** These rows come from
 * their own query (`unpaidFollowUpWhere` in lib/pending-expiry.ts), so they are
 * never in the registrants table, its count or its CSV export, and nothing
 * here edits them. An order is one row rather than one row per runner because
 * staff contact the order, not each runner on it.
 *
 * **Built like the registrants table beside it** (owner, 2026-10-05): the same
 * search box, Filters chip, View chip, mark / unmark checkboxes, No. column,
 * sortable headers, Sort chip below `lg`, Export to CSV, and rows per page
 * and pager, read from one TanStack table by both the desktop table and the
 * cards.
 *
 * **Its export is a file of its own** (`buildUnpaidCheckoutCsv`), never rows
 * in the registrants export, and the trail records it as its own action
 * (`unpaid_checkouts.exported`). A busy race can collect dozens of these, and a staff member
 * working through them should not meet a second way of navigating a list.
 *
 * **Copy contact is the only action.** There is no "send reminder" email:
 * Resend's free tier stops at 100 a day, and a PayMongo link expires, so a
 * reminder would need a new checkout as well. Staff paste the contact into
 * their own message instead.
 */

import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Search, X } from 'lucide-react';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import AdminCardList from '../../../AdminCardList';
import AdminTablePager from '../../../AdminTablePager';
import FiltersMenu, { type FilterGroup } from '../../../FiltersMenu';
import MobileSortMenu from '../../../MobileSortMenu';
import ColumnsViewMenu from './ColumnsViewMenu';
import { selectionColumn } from './registrant-columns';
import RegistrantsDataTable from './RegistrantsDataTable';
import { buildUnpaidCheckoutCsv, downloadUnpaidCheckoutCsv } from './registrant-csv';
import { useAlert } from '@/components/ui/AlertProvider';
import { formatPesos } from '@/lib/money';

/** One unpaid order, worded on the server (page.tsx) in Manila time. */
export type UnpaidCheckout = {
  id: string;
  /** Its place in the list, oldest first; never renumbered by a filter or sort. */
  listNo: number;
  orderRef: string;
  /** Live runners, in runner order. */
  runnerNames: string[];
  /** The first runner, who filled in the form. */
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** "QRPH", "GCASH" — the uppercase label the registrants table uses. */
  paymentMethod: string;
  /** Centavos. */
  totalAmount: number;
  /** ISO, for sorting; `createdLabel` is what is read. */
  createdAt: string;
  createdLabel: string;
  /** "2026-10-03 08:46", Manila, for the CSV. */
  submittedAt: string;
  /** EXPIRED by the sweep; otherwise still PENDING. */
  expired: boolean;
  /** "Expires by …" while pending, the moment it expired once it has. */
  statusDetail: string;
};

/** How long the button reads "Copied" after a copy. */
const COPIED_MS = 1600;

const STATUS_AWAITING = 'AWAITING';
const STATUS_EXPIRED = 'EXPIRED';

export default function UnpaidCheckoutsList({ orders, eventId }: { orders: UnpaidCheckout[]; eventId: string }) {
  const { alert } = useAlert();
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);

  const copyContact = async (order: UnpaidCheckout) => {
    // Name, email and phone on their own lines, with the order reference, so
    // a paste into a chat or a note says who this is and which order.
    const text = [order.contactName, order.contactEmail, order.contactPhone, order.orderRef].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(order.id);
      setTimeout(() => setCopiedId(current => (current === order.id ? null : current)), COPIED_MS);
    } catch {
      await alert(
        'Your browser would not let us reach the clipboard. Select the email and phone and copy them by hand.',
      );
    }
  };

  const copyButton = (order: UnpaidCheckout) => {
    const copied = copiedId === order.id;
    return (
      <button
        type="button"
        className="btn-filter is-compact whitespace-nowrap"
        onClick={() => copyContact(order)}
        aria-label={copied ? `Copied ${order.contactName}'s contact` : `Copy ${order.contactName}'s contact`}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy contact'}
      </button>
    );
  };

  const status = (order: UnpaidCheckout) => (
    <span className="flex flex-col items-start gap-1">
      <span className={`status-badge whitespace-nowrap ${order.expired ? 'neutral' : 'pending'}`}>
        {order.expired ? 'Expired' : 'Awaiting payment'}
      </span>
      {order.statusDetail && (
        <span className="text-xs text-[var(--text-muted)]">{order.statusDetail}</span>
      )}
    </span>
  );

  const runnerCount = (order: UnpaidCheckout) =>
    `${order.runnerNames.length} ${order.runnerNames.length === 1 ? 'runner' : 'runners'}`;

  // The Filters sheet narrows the data before the table, as on the registrants
  // tab, so search, sort and the pager all work inside the result.
  const paymentOptions = useMemo(
    () => [...new Set(orders.map(order => order.paymentMethod))].sort(),
    [orders],
  );
  const hasExpired = orders.some(order => order.expired);
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  const filterGroups: FilterGroup[] = [
    {
      label: 'Status',
      // Offered only when both kinds are on the list; one kind alone could
      // only empty the table.
      options: hasExpired && orders.some(order => !order.expired)
        ? [
            { value: STATUS_AWAITING, label: 'Awaiting payment' },
            { value: STATUS_EXPIRED, label: 'Expired' },
          ]
        : [],
      selected: selectedStatuses,
      onToggle: value => setSelectedStatuses(list => toggle(list, value)),
      capitalize: false,
    },
    {
      label: 'Payment',
      options: paymentOptions.length > 1 ? paymentOptions : [],
      selected: selectedPayments,
      onToggle: value => setSelectedPayments(list => toggle(list, value)),
      capitalize: true,
    },
  ];
  const filtered = useMemo(
    () =>
      orders.filter(
        order =>
          (selectedStatuses.length === 0 ||
            selectedStatuses.includes(order.expired ? STATUS_EXPIRED : STATUS_AWAITING)) &&
          (selectedPayments.length === 0 || selectedPayments.includes(order.paymentMethod)),
      ),
    [orders, selectedStatuses, selectedPayments],
  );

  const columns = useMemo<ColumnDef<UnpaidCheckout>[]>(
    () => [
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
          <div className="max-w-[16rem]">
            <span className="block text-xs text-[var(--text-muted)]">{runnerCount(row.original)}</span>
            {row.original.runnerNames.map((name, i) => (
              <span key={i} className="block truncate">{name}</span>
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
        // Awaiting payment before expired, ascending.
        id: 'status',
        accessorFn: order => (order.expired ? 1 : 0),
        header: 'Status',
        cell: ({ row }) => status(row.original),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => copyButton(row.original),
      },
    ],
    // copyButton reads copiedId, so the cells are rebuilt when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [copiedId],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter, rowSelection, columnVisibility },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    // One search over everything a staff member might have in hand: the
    // reference a runner quotes, any runner's name, the email or the phone.
    globalFilterFn: (row, _columnId, value) => {
      const order = row.original;
      const haystack = [order.orderRef, order.contactEmail, order.contactPhone, ...order.runnerNames]
        .join(' ')
        .toLowerCase();
      return haystack.includes(String(value).trim().toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  /**
   * The registrants tab's rule: the marked rows if any are marked, every row
   * the search and filters leave otherwise. The trail is told first, fire and
   * forget, as the registrants export does — a failed log must not stop the
   * file, and the file is built from rows the screen already holds.
   */
  const handleExportCSV = () => {
    const selectedRows = table.getSelectedRowModel().rows;
    const rowsToExport = selectedRows.length > 0 ? selectedRows : table.getFilteredRowModel().rows;
    fetch(`/api/admin/events/${eventId}/registrants/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: rowsToExport.length, selected: selectedRows.length > 0, list: 'unpaid' }),
      keepalive: true,
    }).catch(() => {});
    downloadUnpaidCheckoutCsv(buildUnpaidCheckoutCsv(rowsToExport.map(r => r.original)), eventId);
  };

  const emptyMessage = orders.length === 0
    ? 'No unpaid checkouts. Every online checkout on this race has been paid.'
    : 'No unpaid checkouts match.';
  const empty = <p className="m-0 py-16 text-center text-[var(--text-muted)]">{emptyMessage}</p>;

  return (
    <div className="flex flex-col gap-4 w-full text-primary">
      <p className="m-0 text-sm text-secondary">
        Online checkouts that were opened and not paid. They are not registrants and are not in
        the registrants export. Each one holds its slot until it expires; expired ones stay here
        until race day.
      </p>

      <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={16} />
            <input
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              className="search-input"
              placeholder="Search orders..."
              aria-label="Search unpaid checkouts"
            />
            {globalFilter && (
              <button
                type="button"
                onClick={() => setGlobalFilter('')}
                aria-label="Clear search"
                className="absolute right-1 max-sm:right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 max-sm:w-11 max-sm:h-11 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <FiltersMenu
            groups={filterGroups}
            onClear={() => {
              setSelectedStatuses([]);
              setSelectedPayments([]);
            }}
            empty="Nothing to filter yet. Status and payment choices appear here once the list has more than one kind."
          />

          <ColumnsViewMenu table={table} />

          <MobileSortMenu table={table} />
        </div>

        <div className="toolbar-actions flex items-center gap-2">
          <button onClick={handleExportCSV} className="btn-light" disabled={orders.length === 0}>
            <Download size={16} /> Export to CSV
          </button>
        </div>
      </div>

      {/* From `lg` up; the cards below take its place under it. */}
      <RegistrantsDataTable table={table} empty={emptyMessage} />

      {/* The same rows as the table above, below `lg`: search, filters, sort
          and the page all come from the one table instance. */}
      <div className="dash-mobile-only">
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
          badges={row => status(row.original)}
          fields={row => [
            { label: 'Runners', value: `${runnerCount(row.original)}: ${row.original.runnerNames.join(', ')}`, full: true },
            { label: 'Email', value: <span className="break-all">{row.original.contactEmail}</span>, full: true },
            { label: 'Phone', value: row.original.contactPhone },
            { label: 'Payment', value: row.original.paymentMethod },
            { label: 'Amount', value: `₱${formatPesos(row.original.totalAmount)}` },
          ]}
          actions={row => copyButton(row.original)}
          empty={empty}
        />
      </div>

      <AdminTablePager table={table} />
    </div>
  );
}
