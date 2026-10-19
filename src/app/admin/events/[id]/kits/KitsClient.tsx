"use client";

/**
 * Kits & Delivery (LOGISTICS_CHANGE_PLAN.md Revision 1, R1–R5): one card per
 * receipt, the counts the kit team works from, search by reference, runner
 * name or email, and the filters All, Pickup, Delivery and Waiting for payment.
 *
 * **One panel, one receipt at a time.** `ShipKitsPanel` is mounted with
 * `key={receipt.id}`, so what staff typed for one receipt is gone when they
 * open another. After a switch or a Cancel the page's server read runs again
 * (`router.refresh()`): a switch changes other cards too — the receipt it
 * rides on gains "Also in this parcel", the counts move — and that read is the
 * one place all of it is decided.
 */

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hourglass, Package, Search, Store, Truck, X } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import { formatEventInstant } from '@/lib/event-schedule';
import { groupByAddress } from '@/lib/runner-address';
import { parcelAddressesOf } from '@/lib/logistics-change-parcels';
import type { ExistingDelivery } from '@/lib/logistics-change';
import type { EventReceipts, Receipt } from '@/lib/logistics-receipts';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { openSwitch } from '../registrants/logistics-change-display';
import ReceiptCard from './ReceiptCard';
import ShipKitsPanel from './ShipKitsPanel';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;
/** Cards drawn at a time; a big race's list grows by this much on request. */
const PAGE = 30;

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

export default function KitsClient({ data, canEdit }: { data: EventReceipts; canEdit: boolean }) {
  const router = useRouter();
  const { alert, toast } = useAlert();
  const { event, receipts, waiting } = data;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [panel, setPanel] = useState<{ id: string; closing: boolean } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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

  const needle = search.trim().toLowerCase();
  const listed = receipts.filter(
    receipt => matches(receipt, filter) && (!needle || receipt.searchText.includes(needle)),
  );
  const refOf = (registrationId: string) =>
    receipts.find(receipt => receipt.id === registrationId)?.orderRef ?? 'a paid receipt';
  const open = panel ? receipts.find(receipt => receipt.id === panel.id) ?? null : null;

  const closePanel = () => {
    setPanel(current => (current ? { ...current, closing: true } : null));
    // Only the panel that was closing: another receipt opened meanwhile stays.
    setTimeout(() => setPanel(current => (current?.closing ? null : current)), CLOSE_MS);
  };

  const cancelSwitch = async (change: LogisticsChangeView) => {
    setCancellingId(change.id);
    try {
      const res = await fetch(`/api/admin/logistics-changes/${change.id}/cancel`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'Switch Not Cancelled', message: body?.error || 'Try again.' });
        router.refresh();
        return;
      }
      toast(`Cancelled the switch ${change.changeRef}. The kits stay on pickup.`);
      router.refresh();
    } catch {
      await alert({ variant: 'error', title: 'Switch Not Cancelled', message: 'Could not reach the server. Try again.' });
    } finally {
      setCancellingId(null);
    }
  };

  const tiles = [
    { title: 'Pickup Kits', value: counts.pickup, icon: <Store size={18} /> },
    { title: 'Delivery Kits', value: counts.delivery, icon: <Truck size={18} /> },
    { title: 'Parcels', value: counts.parcels, icon: <Package size={18} /> },
    { title: 'Waiting for Payment', value: counts.waiting, icon: <Hourglass size={18} /> },
  ];

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
        One card per receipt. A switch moves a whole receipt; kits going to one address ship as one parcel and pay
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
                setShown(PAGE);
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
          <div className="kits-filters" role="group" aria-label="Show">
            {FILTERS.map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => {
                  setFilter(option.value);
                  setShown(PAGE);
                }}
                className="btn-filter"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {listed.length === 0 ? (
        <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
          {receipts.length === 0 ? 'No paid receipts yet.' : 'No receipts match.'}
        </div>
      ) : (
        <>
          <ul className="admin-card-list kits-card-list">
            {listed.slice(0, shown).map(receipt => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
                canEdit={canEdit}
                cancelling={cancellingId === openSwitch(receipt)?.id}
                onSwitch={() => setPanel({ id: receipt.id, closing: false })}
                onCancel={cancelSwitch}
              />
            ))}
          </ul>
          {listed.length > shown && (
            <div className="flex justify-center pt-4">
              <button type="button" onClick={() => setShown(value => value + PAGE)} className="btn-filter min-h-11">
                Show more ({listed.length - shown} left)
              </button>
            </div>
          )}
        </>
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
          onSaved={() => {
            closePanel();
            router.refresh();
          }}
          onStale={() => router.refresh()}
        />
      )}
    </>
  );
}
