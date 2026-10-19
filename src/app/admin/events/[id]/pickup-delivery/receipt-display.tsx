"use client";

/**
 * How one receipt reads on Pickup & Delivery (LOGISTICS_CHANGE_PLAN.md R2),
 * drawn once for the table from `lg` up (`receipt-columns.tsx`) and the cards
 * below it (`ReceiptCard.tsx`), so a badge or a sentence cannot mean one thing
 * on a desktop and another on a phone: the method and switch badges, where the
 * parcel goes and whom it ships with, the switch waiting for payment, and the
 * one action a receipt has.
 *
 * **One action per receipt.** A receipt waiting for payment cannot switch
 * again (L13), so it offers *Cancel switch*; any other offers *Ship kits* or
 * *Back to pickup* while switching is allowed. One labelled chip, never a ⋮
 * menu (§9: a single action stays a chip).
 */

import React from 'react';
import { ArrowRight, Store, Truck, XCircle } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { formatEventInstant } from '@/lib/event-schedule';
import { isOutsidePayment } from '@/lib/category-change-hold';
import { formatPesos } from '@/lib/money';
import { paymentMethodLabel } from '@/lib/registration-codes';
import { LOGISTICS_DIRECTIONS } from '@/lib/logistics-change';
import type { Receipt } from '@/lib/logistics-receipts';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { logisticsMove, openSwitch, shipsWith } from '../registrants/logistics-change-display';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

/** Pickup or Delivery, the "Pickup → Delivery" chip, and the waiting and unchecked states. */
export function ReceiptBadges({ receipt }: { receipt: Receipt }) {
  const move = logisticsMove(receipt);
  return (
    <>
      <span className={`status-badge gap-1 ${receipt.isDelivery ? 'info' : 'neutral'}`}>
        {receipt.isDelivery ? <Truck size={12} aria-hidden="true" /> : <Store size={12} aria-hidden="true" />}
        {receipt.logisticsMethod}
      </span>
      {move && (
        <span className="status-badge info gap-1" aria-label={`Switched from ${move.from} to ${move.to}`}>
          {move.from} <ArrowRight size={12} aria-hidden="true" /> {move.to}
        </span>
      )}
      {openSwitch(receipt) && <span className="status-badge pending">Waiting for payment</span>}
      {receipt.status === 'PENDING' && <span className="status-badge pending">Payment not checked yet</span>}
    </>
  );
}

/**
 * Where a delivery receipt ships: its one address or each household's parcel,
 * the paid parcel it rides on, and the receipts riding on it (R5).
 */
export function shipsToLines(receipt: Receipt): { label: string; value: React.ReactNode }[] {
  if (!receipt.isDelivery) return [];
  const host = shipsWith(receipt);
  const split = receipt.parcels.length > 1;
  return [
    ...receipt.parcels.map((parcel, index) => ({
      label: split ? `Parcel ${index + 1}` : 'Ships to',
      value: (
        <>
          {parcel.address}
          {split && <span className="block text-xs text-[var(--text-muted)]">{parcel.runners.join(', ')}</span>}
        </>
      ),
    })),
    ...(host ? [{ label: 'Ships with', value: `${host}, already paid` }] : []),
    ...(receipt.riderRefs.length > 0 ? [{ label: 'Also in this parcel', value: receipt.riderRefs.join(', ') }] : []),
  ];
}

/** The switch waiting for its fee: how much, where to, how and until when. */
export function WaitingSwitch({ change }: { change: LogisticsChangeView }) {
  const method = change.paymentMethod
    ? isOutsidePayment(change.paymentMethod)
      ? 'GCash or bank transfer'
      : paymentMethodLabel(change.paymentMethod)
    : null;
  return (
    <div className="rounded-lg border border-[var(--dash-hairline)] bg-[var(--ink-02)] p-3 space-y-1 text-sm">
      <p className="m-0 font-medium text-primary">{peso(change.totalCharged || change.fee)} due to ship these kits</p>
      <p className="m-0 text-secondary [overflow-wrap:anywhere]">
        {change.deliverySplit ? "To each runner's home address" : `To ${change.deliveryAddress}`}
      </p>
      <p className="m-0 text-xs text-secondary">
        {method ? `To pay by ${method}` : 'To pay'}
        {change.holdUntil ? ` · waits until ${formatEventInstant(change.holdUntil)}` : ''}
      </p>
      <p className="m-0 text-xs text-[var(--text-muted)]">Stays on pickup until paid. {change.changeRef}</p>
    </div>
  );
}

/** The receipt's one action, or nothing when it has none for this person now. */
export function ReceiptAction({
  receipt,
  canEdit,
  cancelling,
  onSwitch,
  onCancel,
}: {
  receipt: Receipt;
  /** `registration:edit`, decided on the server. */
  canEdit: boolean;
  cancelling: boolean;
  onSwitch: () => void;
  onCancel: (change: LogisticsChangeView) => void;
}) {
  if (!canEdit) return null;
  const waiting = openSwitch(receipt);
  // The table row opens on a click; its button must not open it too.
  const press = (action: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    action();
  };
  if (waiting) {
    return (
      <button
        type="button"
        onClick={press(() => onCancel(waiting))}
        disabled={cancelling}
        className="btn-filter is-compact is-danger whitespace-nowrap"
      >
        {cancelling ? (
          <BusyLabel>Cancelling</BusyLabel>
        ) : (
          <>
            <XCircle size={16} aria-hidden="true" /> Cancel switch
          </>
        )}
      </button>
    );
  }
  if (!receipt.canSwitch.allowed) return null;
  const toDelivery = receipt.canSwitch.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY;
  return (
    <button type="button" onClick={press(onSwitch)} className="btn-filter is-compact whitespace-nowrap">
      {toDelivery ? <Truck size={16} aria-hidden="true" /> : <Store size={16} aria-hidden="true" />}
      {toDelivery ? 'Ship kits' : 'Back to pickup'}
    </button>
  );
}
