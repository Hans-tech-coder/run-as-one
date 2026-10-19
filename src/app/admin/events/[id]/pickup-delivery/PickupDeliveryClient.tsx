"use client";

/**
 * Pickup & Delivery (LOGISTICS_CHANGE_PLAN.md Revision 1, R1–R5): one row per
 * receipt, the counts the kit team works from, search by reference, runner
 * name or email, and the filters All, Pickup, Delivery and Waiting for payment.
 *
 * **A table from `lg` up, cards below it** (§9 "One admin table"), both
 * reading one TanStack instance, so search, filters, sort and the pager are
 * shared: `AdminDataTable` with `RECEIPT_COLUMNS`, and `AdminCardList` on a
 * phone. A row with a switch waiting or a history opens in place under it;
 * a card folds the same things into its body.
 *
 * **One panel, one receipt at a time.** `ShipKitsPanel` is mounted with
 * `key={receipt.id}`, so what staff typed for one receipt is gone when they
 * open another. After a switch or a Cancel the page's server read runs again
 * (`router.refresh()`): a switch changes other rows too — the receipt it
 * rides on gains "Also in this parcel", the counts move — and that read is the
 * one place all of it is decided.
 *
 * **A switch waiting for payment** (Session 3) shows its controls under the
 * fee in the opened row and in the card's body (`WaitingSwitchActions`): copy
 * or email the payment link, record a GCash or bank payment, cancel. An email
 * Resend refused opens the by-hand send (`SwitchEmailModal`), here or from the
 * history's *Send email by hand*.
 */

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { Hourglass, Package, Search, Store, Truck, X } from 'lucide-react';
import AdminCardList from '@/app/admin/AdminCardList';
import AdminDataTable, { AdminColumnsMenu, rowPosition } from '@/app/admin/AdminDataTable';
import AdminTablePager from '@/app/admin/AdminTablePager';
import MobileSortMenu from '@/app/admin/MobileSortMenu';
import { formatEventInstant } from '@/lib/event-schedule';
import { paymentMethodLabel } from '@/lib/registration-codes';
import { groupByAddress } from '@/lib/runner-address';
import { parcelAddressesOf } from '@/lib/logistics-change-parcels';
import type { ExistingDelivery } from '@/lib/logistics-change';
import type { EventReceipts, Receipt } from '@/lib/logistics-receipts';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';
import { openSwitch } from '../registrants/logistics-change-display';
import { RECEIPT_COLUMNS, opens, type PickupDeliveryTableMeta } from './receipt-columns';
import { ReceiptAction, ReceiptBadges, WaitingSwitch, shipsToLines } from './receipt-display';
import SwitchHistory, { SwitchHistoryList } from './SwitchHistory';
import ShipKitsPanel from './ShipKitsPanel';
import SwitchEmailModal from './SwitchEmailModal';
import WaitingSwitchActions, {
  refusedEmail,
  type PickupDeliveryPermissions,
  type SwitchEmailRequest,
} from './WaitingSwitchActions';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

type Filter = 'all' | 'pickup' | 'delivery' | 'waiting';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'waiting', label: 'Waiting for payment' },
];

function matches(receipt: Receipt, filter: Filter): boolean {
  if (filter === 'pickup') return !receipt.isDelivery;
  if (filter === 'delivery') return receipt.isDelivery;
  if (filter === 'waiting') return !!openSwitch(receipt);
  return true;
}

export default function PickupDeliveryClient({
  data,
  permissions,
}: {
  data: EventReceipts;
  permissions: PickupDeliveryPermissions;
}) {
  const router = useRouter();
  const canEdit = permissions.edit;
  const { event, receipts, waiting } = data;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ id: string; closing: boolean } | null>(null);
  const [emailRequest, setEmailRequest] = useState<SwitchEmailRequest | null>(null);

  // The event's PAID deliveries, the parcels a new one can ride on (L6).
  const existing: ExistingDelivery[] = useMemo(
    () =>
      receipts
        .filter(receipt => receipt.status === 'PAID' && receipt.isDelivery)
        .map(receipt => ({
          registrationId: receipt.id,
          status: receipt.status,
          logisticsMethod: receipt.logisticsCode,
          deliveryAddress: receipt.deliveryAddress,
          deliverySplit: receipt.deliverySplit,
          runners: receipt.runners.map(runner => runner.address),
        })),
    [receipts],
  );

  const counts = useMemo(() => {
    const kitsOf = (list: Receipt[]) => list.reduce((sum, receipt) => sum + receipt.runners.length, 0);
    const delivery = receipts.filter(receipt => receipt.isDelivery);
    // One parcel per distinct address across receipts, by the quote's own
    // rule: a receipt riding on another shares its parcel.
    const addresses = delivery.flatMap(receipt =>
      parcelAddressesOf({ ...receipt, runners: receipt.runners.map(runner => runner.address) }),
    );
    return {
      pickup: kitsOf(receipts.filter(receipt => !receipt.isDelivery)),
      delivery: kitsOf(delivery),
      parcels: groupByAddress(addresses).length,
      waiting: receipts.filter(receipt => openSwitch(receipt)).length,
    };
  }, [receipts]);

  // Memoized: TanStack goes back to page one whenever its data changes identity (§9).
  const listed = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return receipts.filter(receipt => matches(receipt, filter) && (!needle || receipt.searchText.includes(needle)));
  }, [receipts, search, filter]);

  const refOf = (registrationId: string) =>
    receipts.find(receipt => receipt.id === registrationId)?.orderRef ?? 'a paid receipt';
  const open = panel ? receipts.find(receipt => receipt.id === panel.id) ?? null : null;

  const closePanel = () => {
    setPanel(current => (current ? { ...current, closing: true } : null));
    // Only the panel that was closing: another receipt opened meanwhile stays.
    setTimeout(() => setPanel(current => (current?.closing ? null : current)), CLOSE_MS);
  };

  const refresh = () => router.refresh();

  /** The by-hand send of an applied switch's email, from the history. */
  const sendAppliedByHand = (receipt: Receipt) =>
    permissions.email
      ? (change: LogisticsChangeView) =>
          setEmailRequest({
            kind: 'applied',
            changeId: change.id,
            changeRef: change.changeRef,
            orderRef: receipt.orderRef,
            message: null,
            error: change.lastEmailError,
          })
      : undefined;

  /** The switch waiting for payment, with what this person may do about it. */
  const waitingPanel = (receipt: Receipt) => {
    const change = openSwitch(receipt);
    if (!change) return null;
    return (
      <div className="space-y-3">
        <WaitingSwitch change={change} />
        <WaitingSwitchActions
          change={change}
          orderRef={receipt.orderRef}
          permissions={permissions}
          onChanged={refresh}
          onSendEmail={setEmailRequest}
        />
      </div>
    );
  };

  const toggleRow = (receipt: Receipt) => {
    if (opens(receipt)) setOpenId(current => (current === receipt.id ? null : receipt.id));
  };

  const meta: PickupDeliveryTableMeta = {
    openId,
    canEdit,
    onSwitch: receipt => setPanel({ id: receipt.id, closing: false }),
    onToggle: toggleRow,
  };

  const table = useReactTable({
    data: listed,
    columns: RECEIPT_COLUMNS,
    getRowId: receipt => receipt.id,
    state: { sorting, columnVisibility },
    meta,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    // A switch re-reads the page; staff stay on the page of rows they were on.
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const tiles = [
    { title: 'Pickup Kits', value: counts.pickup, icon: <Store size={18} /> },
    { title: 'Delivery Kits', value: counts.delivery, icon: <Truck size={18} /> },
    { title: 'Parcels', value: counts.parcels, icon: <Package size={18} /> },
    { title: 'Waiting for Payment', value: counts.waiting, icon: <Hourglass size={18} /> },
  ];
  const emptyMessage = receipts.length === 0 ? 'No paid receipts yet.' : 'No receipts match.';

  return (
    <>
      <div className="metrics-grid">
        {tiles.map(tile => (
          <div key={tile.title} className="metric-card">
            <div className="metric-header">
              <span className="metric-title">{tile.title}</span>
              <span className="metric-icon">{tile.icon}</span>
            </div>
            <div className="metric-value tabular-nums">{tile.value}</div>
          </div>
        ))}
      </div>

      <p className="mb-4 text-sm text-secondary">
        One row per receipt. A switch moves a whole receipt; kits going to one address ship as one parcel and pay
        once.{' '}
        {event.deadline ? `Switches close ${formatEventInstant(event.deadline)}.` : ''}
      </p>

      <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={16} />
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                table.setPageIndex(0);
              }}
              className="search-input"
              placeholder="Search RM number, runner or email..."
              aria-label="Search receipts"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1 max-sm:right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 max-sm:w-11 max-sm:h-11 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="pickup-delivery-filters" role="group" aria-label="Show">
            {FILTERS.map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => {
                  setFilter(option.value);
                  table.setPageIndex(0);
                }}
                className="btn-filter"
              >
                {option.label}
              </button>
            ))}
          </div>
          <AdminColumnsMenu table={table} />
          <MobileSortMenu table={table} />
        </div>
      </div>

      <AdminDataTable
        table={table}
        empty={emptyMessage}
        leadColumn="no"
        cellClassName={() => 'align-top'}
        rowProps={row =>
          opens(row.original)
            ? {
                onClick: () => toggleRow(row.original),
                onKeyDown: e => {
                  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                  e.preventDefault();
                  toggleRow(row.original);
                },
                tabIndex: 0,
                'aria-expanded': openId === row.original.id,
                className: 'cursor-pointer',
              }
            : {}
        }
        renderSubRow={row =>
          openId === row.original.id && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] items-start">
              {waitingPanel(row.original) ?? (
                <p className="m-0 text-sm text-secondary">Nothing waiting for payment.</p>
              )}
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wider text-secondary">Switch history</p>
                <SwitchHistoryList
                  changes={row.original.logisticsChanges}
                  canViewProof={permissions.proof}
                  onSendEmail={sendAppliedByHand(row.original)}
                />
              </div>
            </div>
          )
        }
      />

      <div className="dash-mobile-only">
        <AdminCardList
          items={table.getRowModel().rows.map(row => row.original)}
          getKey={receipt => receipt.id}
          label="Receipts"
          className="is-flush"
          leading={receipt => {
            const row = table.getRowModel().rows.find(r => r.id === receipt.id);
            return row ? rowPosition(table.getSortedRowModel().flatRows, row) : null;
          }}
          title={receipt => <span className="font-mono">{receipt.orderRef}</span>}
          subtitle={receipt =>
            `${receipt.runners.length} ${receipt.runners.length === 1 ? 'kit' : 'kits'} · paid by ${paymentMethodLabel(receipt.paymentMethod)}`
          }
          badges={receipt => <ReceiptBadges receipt={receipt} />}
          fields={receipt => [
            {
              label: receipt.runners.length === 1 ? 'Runner' : 'Runners',
              full: true,
              value: (
                <ul className="m-0 p-0 list-none space-y-1">
                  {receipt.runners.map(runner => (
                    <li key={runner.id}>
                      <span className="font-medium">{runner.name}</span>
                      {runner.category && <span className="text-secondary"> &middot; {runner.category}</span>}
                      <span className="block text-xs text-[var(--text-muted)]">{runner.email}</span>
                    </li>
                  ))}
                </ul>
              ),
            },
            ...shipsToLines(receipt).map(line => ({ ...line, full: true })),
          ]}
          expanded={receipt =>
            opens(receipt) && (
              <div className="space-y-3">
                {waitingPanel(receipt)}
                <SwitchHistory
                  changes={receipt.logisticsChanges}
                  canViewProof={permissions.proof}
                  onSendEmail={sendAppliedByHand(receipt)}
                />
              </div>
            )
          }
          actions={receipt => (
            <ReceiptAction
              receipt={receipt}
              canEdit={canEdit}
              onSwitch={() => setPanel({ id: receipt.id, closing: false })}
            />
          )}
          empty={
            <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
              {emptyMessage}
            </div>
          }
        />
      </div>

      <AdminTablePager table={table} />

      {emailRequest && (
        <SwitchEmailModal
          key={`${emailRequest.changeId}-${emailRequest.kind}`}
          request={emailRequest}
          onClose={() => setEmailRequest(null)}
          onMarked={refresh}
        />
      )}

      {open && panel && (
        <ShipKitsPanel
          key={open.id}
          receipt={open}
          event={event}
          existing={existing}
          waiting={waiting}
          refOf={refOf}
          isClosing={panel.closing}
          onClose={closePanel}
          onSaved={({ change, email }) => {
            closePanel();
            router.refresh();
            const kind = change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT ? 'created' : 'applied';
            const refused = refusedEmail(change, open.orderRef, kind, email);
            if (refused) setEmailRequest(refused);
          }}
          onStale={() => router.refresh()}
        />
      )}
    </>
  );
}
