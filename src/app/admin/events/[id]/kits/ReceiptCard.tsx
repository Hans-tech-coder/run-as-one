"use client";

/**
 * One receipt on Kits & Delivery (LOGISTICS_CHANGE_PLAN.md R2): its reference,
 * its runners and kits, pickup or delivery, where each household's parcel
 * goes, the paid parcel it ships with or the receipts riding on it, a switch
 * waiting for payment with its Cancel, and its switch history. *Ship kits* or
 * *Back to pickup* opens the panel for this receipt alone (R3).
 *
 * Sessions 3 and 4 add *Copy payment link*, *Email how to pay* and *Record
 * payment* beside Cancel on the waiting switch.
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
import SwitchHistory from './SwitchHistory';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

export default function ReceiptCard({
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
  const move = logisticsMove(receipt);
  const host = shipsWith(receipt);
  const waiting = openSwitch(receipt);
  const kits = receipt.runners.length;
  const switchable = canEdit && receipt.canSwitch.allowed;
  const waitingMethod = waiting?.paymentMethod
    ? isOutsidePayment(waiting.paymentMethod)
      ? 'GCash or bank transfer'
      : paymentMethodLabel(waiting.paymentMethod)
    : null;

  return (
    <li className="admin-card">
      <div className="admin-card-head">
        <div className="admin-card-heading">
          <div className="admin-card-title font-mono">{receipt.orderRef}</div>
          <div className="admin-card-subtitle">
            {kits} {kits === 1 ? 'kit' : 'kits'} &middot; paid by {paymentMethodLabel(receipt.paymentMethod)}
          </div>
        </div>
      </div>

      <div className="admin-card-badges">
        <span className={`status-badge gap-1 ${receipt.isDelivery ? 'info' : 'neutral'}`}>
          {receipt.isDelivery ? <Truck size={12} aria-hidden="true" /> : <Store size={12} aria-hidden="true" />}
          {receipt.logisticsMethod}
        </span>
        {move && (
          <span className="status-badge info gap-1" aria-label={`Switched from ${move.from} to ${move.to}`}>
            {move.from} <ArrowRight size={12} aria-hidden="true" /> {move.to}
          </span>
        )}
        {waiting && <span className="status-badge pending">Waiting for payment</span>}
        {receipt.status === 'PENDING' && <span className="status-badge pending">Payment not checked yet</span>}
      </div>

      <ul className="m-0 p-0 list-none space-y-1 text-sm">
        {receipt.runners.map(runner => (
          <li key={runner.id} className="min-w-0 [overflow-wrap:anywhere]">
            <span className="font-medium text-primary">{runner.name}</span>
            {runner.category && <span className="text-secondary"> &middot; {runner.category}</span>}
            <span className="block text-xs text-[var(--text-muted)]">{runner.email}</span>
          </li>
        ))}
      </ul>

      {receipt.isDelivery && (
        <dl className="admin-card-fields">
          {receipt.parcels.map((parcel, index) => (
            <div key={index} className="admin-card-field is-full">
              <dt>{receipt.parcels.length > 1 ? `Parcel ${index + 1}` : 'Ships to'}</dt>
              <dd>
                {parcel.address}
                {receipt.parcels.length > 1 && (
                  <span className="block text-xs text-[var(--text-muted)]">{parcel.runners.join(', ')}</span>
                )}
              </dd>
            </div>
          ))}
          {host && (
            <div className="admin-card-field is-full">
              <dt>Ships with</dt>
              <dd>{host}, already paid</dd>
            </div>
          )}
          {receipt.riderRefs.length > 0 && (
            <div className="admin-card-field is-full">
              <dt>Also in this parcel</dt>
              <dd>{receipt.riderRefs.join(', ')}</dd>
            </div>
          )}
        </dl>
      )}

      {waiting && (
        <div className="rounded-lg border border-[var(--dash-hairline)] bg-[var(--ink-02)] p-3 space-y-1 text-sm">
          <p className="m-0 font-medium text-primary">
            {peso(waiting.totalCharged || waiting.fee)} due to ship these kits
          </p>
          <p className="m-0 text-secondary [overflow-wrap:anywhere]">
            {waiting.deliverySplit ? "To each runner's home address" : `To ${waiting.deliveryAddress}`}
          </p>
          <p className="m-0 text-xs text-secondary">
            {waitingMethod ? `To pay by ${waitingMethod}` : 'To pay'}
            {waiting.holdUntil ? ` · waits until ${formatEventInstant(waiting.holdUntil)}` : ''}
          </p>
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Stays on pickup until paid. {waiting.changeRef}
          </p>
        </div>
      )}

      <SwitchHistory changes={receipt.logisticsChanges} />

      {(switchable || (waiting && canEdit)) && (
        <div className="admin-card-actions">
          {switchable && (
            <button type="button" onClick={onSwitch} className="btn-filter is-compact">
              {receipt.canSwitch.allowed && receipt.canSwitch.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY ? (
                <>
                  <Truck size={16} aria-hidden="true" /> Ship kits
                </>
              ) : (
                <>
                  <Store size={16} aria-hidden="true" /> Back to pickup
                </>
              )}
            </button>
          )}
          {waiting && canEdit && (
            <button
              type="button"
              onClick={() => onCancel(waiting)}
              disabled={cancelling}
              className="btn-filter is-compact is-danger"
            >
              {cancelling ? (
                <BusyLabel>Cancelling</BusyLabel>
              ) : (
                <>
                  <XCircle size={16} aria-hidden="true" /> Cancel switch
                </>
              )}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
