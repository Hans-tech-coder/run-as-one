"use client";

/**
 * One receipt's delivery switch, opened from a registrant's row
 * (LOGISTICS_CHANGE_PLAN.md Revision 2): how its kits go now, where the
 * parcel ships and whom it ships with, the switch still waiting for its fee
 * with what staff may do about it (`WaitingSwitchActions`), and every switch
 * the receipt has had (`SwitchHistoryList`).
 *
 * **It is about the receipt, not the runner.** A switch moves the whole order
 * (L2), so on a group registration every runner's row opens the same receipt
 * and the header names how many runners it carries.
 *
 * Built on the *Ship kits* panel's frame, so the two read as one family.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { formatEventInstant } from '@/lib/event-schedule';
import { isOutsidePayment } from '@/lib/category-change-hold';
import { formatPesos } from '@/lib/money';
import { paymentMethodLabel } from '@/lib/registration-codes';
import type { Receipt } from '@/lib/logistics-receipts';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { openSwitch, shipsWith } from './logistics-change-display';
import { SwitchHistoryList } from './SwitchHistory';
import WaitingSwitchActions, { type SwitchEmailRequest, type SwitchPermissions } from './WaitingSwitchActions';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

/**
 * Where a delivery receipt ships: its one address or each household's parcel,
 * the paid parcel it rides on, and the receipts riding on it (R5).
 */
function shipsToLines(receipt: Receipt): { label: string; value: React.ReactNode }[] {
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
function WaitingSwitch({ change }: { change: LogisticsChangeView }) {
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
      {change.proofSubmitted ? (
        // Revision 3 T6, T8: the runner's proof is in, so the hold no longer runs out.
        <p className="m-0 text-xs text-secondary">
          Proof submitted by the runner · reference {change.transactionNumber} · waits for you to check it until the
          switch deadline
        </p>
      ) : (
        <p className="m-0 text-xs text-secondary">
          {method ? `To pay by ${method}` : 'To pay'}
          {change.holdUntil ? ` · waits until ${formatEventInstant(change.holdUntil)}` : ''}
        </p>
      )}
      <p className="m-0 text-xs text-[var(--text-muted)]">Stays on pickup until paid. {change.changeRef}</p>
    </div>
  );
}

export default function OrderSwitchModal({
  receipt,
  permissions,
  isClosing,
  onClose,
  onChanged,
  onSendEmail,
}: {
  receipt: Receipt;
  permissions: SwitchPermissions;
  /** True while the parent plays the closing transition before unmounting. */
  isClosing: boolean;
  onClose: () => void;
  /** Something moved: the page's read runs again. */
  onChanged: () => void;
  onSendEmail: (request: SwitchEmailRequest) => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const isOpen = entered && !isClosing;
  const waiting = openSwitch(receipt);
  const lines = shipsToLines(receipt);
  const runners = receipt.runners.length;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-switch-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-clip ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="order-switch-title" className="text-xl font-semibold text-primary m-0">
              {waiting ? 'Delivery Payment' : 'Pickup & Delivery History'}
            </h3>
            <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
              {receipt.orderRef} &middot; {runners === 1 ? receipt.runners[0].name : `${runners} runners on this receipt`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex-1 space-y-5 text-sm">
          <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
            <dt className="text-secondary">Kits</dt>
            <dd className="m-0 text-primary">{receipt.logisticsMethod}</dd>
            {lines.map(line => (
              <React.Fragment key={line.label}>
                <dt className="text-secondary">{line.label}</dt>
                <dd className="m-0 text-primary [overflow-wrap:anywhere]">{line.value}</dd>
              </React.Fragment>
            ))}
          </dl>

          {waiting && (
            <div className="space-y-3">
              <WaitingSwitch change={waiting} />
              <WaitingSwitchActions
                change={waiting}
                orderRef={receipt.orderRef}
                permissions={permissions}
                onChanged={onChanged}
                onSendEmail={onSendEmail}
              />
            </div>
          )}

          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-wider text-secondary">Switch history</p>
            <SwitchHistoryList
              changes={receipt.logisticsChanges}
              canViewProof={permissions.proof}
              onSendEmail={
                permissions.email
                  ? change =>
                      onSendEmail({
                        kind: 'applied',
                        changeId: change.id,
                        changeRef: change.changeRef,
                        orderRef: receipt.orderRef,
                        message: null,
                        error: change.lastEmailError,
                      })
                  : undefined
              }
            />
          </div>
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-11 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
