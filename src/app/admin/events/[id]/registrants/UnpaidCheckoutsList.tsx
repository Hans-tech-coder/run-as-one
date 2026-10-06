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
 * sortable headers, Sort chip with the cards, Export to CSV, and rows per page
 * and pager, read from one TanStack table by both the desktop table and the
 * cards.
 *
 * **Its export is a file of its own** (`buildUnpaidCheckoutCsv`), never rows
 * in the registrants export, and the trail records it as its own action
 * (`unpaid_checkouts.exported`). A busy race can collect dozens of these, and a staff member
 * working through them should not meet a second way of navigating a list.
 *
 * **Each row has a ⋮ menu** (UNPAID_FOLLOWUP_PLAN.md Batch 1,
 * `UnpaidCheckoutActions.tsx`): check the payment with PayMongo first, then
 * call, text, email or copy the contact, then log how it went. The latest
 * follow-up is the Follow-up column, read from the activity trail on the
 * server, and the Filters sheet can narrow to "Not contacted yet" or any one
 * outcome so two staff members can split the list without calling the same
 * runner.
 *
 * **Cancel order… closes an order the runner has said no to**
 * (UNPAID_FOLLOWUP_PLAN.md Batch 2, `CancelOrderModal.tsx`), so its slot and
 * promo go back now rather than at the next sweep. A cancelled order leaves
 * the default view but stays under Filters → Status → Cancelled until race
 * day (decision D6), so a mistaken cancel can be found. The tab's count is
 * the orders still awaiting payment only.
 *
 * **The payment link goes out from here** (UNPAID_FOLLOWUP_PLAN.md Batch 4):
 * each pending row's menu can email it or open it to send by hand
 * (`PaymentLinkEmailModal.tsx`), and with rows marked the toolbar offers
 * **Send payment link to N** (`SendLinksButton.tsx`). Rows are keyed by
 * order id, so a mark stays on its order when a filter or search changes the
 * list under it.
 */

import React, { useMemo, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import AdminTablePager from '../../../AdminTablePager';
import FiltersMenu, { type FilterGroup } from '../../../FiltersMenu';
import MobileSortMenu from '../../../MobileSortMenu';
import ColumnsViewMenu from './ColumnsViewMenu';
import { unpaidColumns } from './unpaid-columns';
import UnpaidCheckoutCards from './UnpaidCheckoutCards';
import RegistrantsDataTable from './RegistrantsDataTable';
import { buildUnpaidCheckoutCsv, downloadUnpaidCheckoutCsv } from './registrant-csv';
import FollowUpModal from './FollowUpModal';
import UnpaidCheckoutActions from './UnpaidCheckoutActions';
import SendLinksButton from './SendLinksButton';
import CancelOrderModal from './CancelOrderModal';
import PaymentLinkEmailModal, { type PreparedLinkEmail } from './PaymentLinkEmailModal';
import {
  FOLLOW_UP_LABELS,
  FOLLOW_UP_OUTCOMES,
  NOT_CONTACTED,
  type FollowUpRecord,
} from '@/lib/follow-up';

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
  /** PENDING until paid; EXPIRED by the sweep; CANCELLED by staff while unpaid. */
  status: 'PENDING' | 'EXPIRED' | 'CANCELLED';
  /**
   * "Expires by …" while pending, the moment it expired once it has, and who
   * cancelled it and when once someone has.
   */
  statusDetail: string;
  /** Why it was cancelled, as Cancel order… recorded it; null otherwise. */
  cancelReason: string | null;
  /** The latest follow-up logged, with "2h ago" worded on the server; null if none. */
  followUp: (FollowUpRecord & { ago: string }) | null;
};

const STATUS_OPTIONS: { value: UnpaidCheckout['status']; label: string }[] = [
  { value: 'PENDING', label: 'Awaiting payment' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function UnpaidCheckoutsList({
  orders,
  eventId,
  eventSlug,
  canValidate,
  canEmail,
}: {
  orders: UnpaidCheckout[];
  eventId: string;
  eventSlug: string;
  /**
   * `registration:validate`: both a payment check that finds the money and a
   * cancel settle the order's status.
   */
  canValidate: boolean;
  /** `registration:email`: the payment and registration links. */
  canEmail: boolean;
}) {
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [selectedFollowUps, setSelectedFollowUps] = useState<string[]>([]);
  // One modal for the list, not one per row: the table and the cards are
  // both mounted, and each would otherwise carry its own.
  const [followUpOrder, setFollowUpOrder] = useState<UnpaidCheckout | null>(null);
  const [cancelOrder, setCancelOrder] = useState<UnpaidCheckout | null>(null);
  const [preparedEmail, setPreparedEmail] = useState<PreparedLinkEmail | null>(null);

  const actions = (order: UnpaidCheckout, className?: string) => (
    <UnpaidCheckoutActions
      order={order}
      eventSlug={eventSlug}
      canValidate={canValidate}
      canEmail={canEmail}
      onLogFollowUp={setFollowUpOrder}
      onCancel={setCancelOrder}
      onSendByHand={setPreparedEmail}
      className={className}
    />
  );

  // The Filters sheet narrows the data before the table, as on the registrants
  // tab, so search, sort and the pager all work inside the result.
  const paymentOptions = useMemo(
    () => [...new Set(orders.map(order => order.paymentMethod))].sort(),
    [orders],
  );
  const statusesPresent = STATUS_OPTIONS.filter(option => orders.some(order => order.status === option.value));
  const cancelledCount = orders.filter(order => order.status === 'CANCELLED').length;
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  const filterGroups: FilterGroup[] = [
    {
      label: 'Status',
      // Each kind on the list, when there is more than one; one kind alone
      // could only empty the table. Cancelled is always offered when there
      // is one, because the default view hides it and this is the way in.
      options: statusesPresent.length > 1 || cancelledCount > 0 ? statusesPresent : [],
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
    {
      // Every outcome is offered, not only those on the list: "who still
      // has not been called?" is asked before anyone has been.
      label: 'Follow-up',
      options: orders.length > 0
        ? [
            { value: NOT_CONTACTED, label: 'Not contacted yet' },
            ...FOLLOW_UP_OUTCOMES.map(value => ({ value, label: FOLLOW_UP_LABELS[value] })),
          ]
        : [],
      selected: selectedFollowUps,
      onToggle: value => setSelectedFollowUps(list => toggle(list, value)),
      capitalize: false,
    },
  ];
  const filtered = useMemo(
    () =>
      orders.filter(
        order =>
          // Cancelled orders only when asked for (decision D6).
          (selectedStatuses.length === 0
            ? order.status !== 'CANCELLED'
            : selectedStatuses.includes(order.status)) &&
          (selectedPayments.length === 0 || selectedPayments.includes(order.paymentMethod)) &&
          (selectedFollowUps.length === 0 ||
            selectedFollowUps.includes(order.followUp?.outcome ?? NOT_CONTACTED)),
      ),
    [orders, selectedStatuses, selectedPayments, selectedFollowUps],
  );

  const columns = useMemo(
    () => unpaidColumns(order => actions(order)),
    // `actions` reads only these props and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canValidate, canEmail, eventSlug],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter, rowSelection, columnVisibility },
    // Keyed by order, so a mark stays on its order when the filters change
    // the rows under it: the bulk send must reach exactly who was marked.
    getRowId: order => order.id,
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

  // The marked orders, read from the marks themselves (keyed by order id)
  // rather than from `table.getSelectedRowModel()`: asking the table for a row
  // model during this component's own first render queues TanStack's page
  // reset, which then sets state on the list before it has mounted.
  const markedOrders = filtered.filter(order => rowSelection[order.id]);

  const emptyMessage = orders.length === 0
    ? 'No unpaid checkouts. Every online checkout on this race has been paid.'
    : cancelledCount === orders.length && selectedStatuses.length === 0
      ? `No unpaid checkouts left. ${cancelledCount} cancelled ${cancelledCount === 1 ? 'order is' : 'orders are'} under Filters → Status → Cancelled.`
      : 'No unpaid checkouts match.';
  const empty = <p className="m-0 py-16 text-center text-[var(--text-muted)]">{emptyMessage}</p>;

  return (
    // `unpaid-list` makes the table/card switch follow this list's own width
    // (Admin.css), not the window's: beside the sidebar a 1024px window
    // leaves it about 660px, and the table needs about 950.
    <div className="unpaid-list flex flex-col gap-4 w-full text-primary">
      <p className="m-0 text-sm text-secondary">
        Online checkouts that were opened and not paid. They are not registrants and are not in
        the registrants export. Each one holds its slot until it expires or is cancelled; expired
        and cancelled ones stay here until race day, cancelled ones under Filters → Status.
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
              setSelectedFollowUps([]);
            }}
            empty="Nothing to filter yet. Status and payment choices appear here once the list has more than one kind."
          />

          <ColumnsViewMenu table={table} />

          <MobileSortMenu table={table} />
        </div>

        <div className="toolbar-actions flex items-center gap-2">
          {canEmail && (
            <SendLinksButton
              selected={markedOrders}
              onDone={() => {
                setRowSelection({});
                router.refresh();
              }}
            />
          )}
          <button onClick={handleExportCSV} className="btn-light" disabled={orders.length === 0}>
            <Download size={16} /> Export to CSV
          </button>
        </div>
      </div>

      {/* While the list is at least 60rem wide; the cards below take its
          place under that. */}
      <RegistrantsDataTable table={table} empty={emptyMessage} />

      {/* The same rows as the table above, under 60rem: search, filters, sort
          and the page all come from the one table instance. */}
      <div className="dash-mobile-only">
        <UnpaidCheckoutCards table={table} actions={order => actions(order, 'ml-auto')} empty={empty} />
      </div>

      <AdminTablePager table={table} />

      {followUpOrder && (
        <FollowUpModal
          key={followUpOrder.id}
          order={followUpOrder}
          onClose={() => setFollowUpOrder(null)}
          // Read the page again, so the row shows the line as the server
          // has it and both tabs' counts stay true.
          onSaved={() => router.refresh()}
        />
      )}

      {preparedEmail && (
        <PaymentLinkEmailModal
          key={preparedEmail.order.id}
          prepared={preparedEmail}
          onClose={() => setPreparedEmail(null)}
          // "Link sent" lands on the row, as the server has it.
          onMarked={() => router.refresh()}
        />
      )}

      {cancelOrder && (
        <CancelOrderModal
          key={cancelOrder.id}
          order={cancelOrder}
          onClose={() => setCancelOrder(null)}
          // The order leaves the default view and the tab's count drops, so
          // the page is read again rather than patched here.
          onCancelled={() => router.refresh()}
        />
      )}
    </div>
  );
}
