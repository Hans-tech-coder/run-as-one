"use client";

/**
 * *Ship kits* / *Back to pickup*: moving one paid receipt between kit pickup
 * and delivery (LOGISTICS_CHANGE_PLAN.md L2–L13, R3–R5, Revision 2), opened
 * from any of its runners' rows on the registrants table when the switch is allowed.
 *
 * **Ship kits is confirm and send** (Revision 3b T12): no address to type. A
 * line says where the switch starts from (Runner 1's home address, or none, in
 * which case the runner gives it on the link and the fee follows), then how
 * the runner pays and *Send to Runner*. Only *Already paid* (T13) opens the
 * address, laid out as below.
 *
 * **The address** (Already paid): Runner 1's home address, shown as a card
 * with Change, as in the registration wizard's Logistics step
 * (`ship-kits-address.tsx`); staff add the ZIP, a landmark or another
 * receiver, and a runner with no home address on file starts on empty
 * fields. A group's kits all ship to that one address (L2). The quote
 * below is live and is the route's own arithmetic (`quoteLogisticsChange`): a
 * parcel whose address already gets a paid delivery rides on it at ₱0 and says
 * which receipt it ships with (L6); one whose address is still waiting for
 * another receipt's fee is refused (R4). A fee keeps the switch waiting for
 * payment (L12) and nothing moves until it is paid. Staff need only pick how
 * it is paid (Revision 3 T1): the emailed link lets the runner confirm or
 * change the address and receiver before paying.
 *
 * **Back to pickup** is free and gives nothing back (L9). A receipt others ride
 * on says which, and waits for them to go back first (R5).
 *
 * **The parent mounts it with `key={receipt.id}`**, so its state (`useShipKits`)
 * is new for every receipt. Built on the remarks modal's panel, like Change
 * category.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { useShipKits } from './useShipKits';
import { DeliveryFields, PaymentChoice, PickupFields, SendSummary, SwitchQuote, WaitingWarning, Warning } from './ship-kits-fields';

type Props = Parameters<typeof useShipKits>[0] & {
  /** True while the parent plays the closing transition before unmounting. */
  isClosing: boolean;
  onClose: () => void;
};

export default function ShipKitsPanel({ isClosing, onClose, ...input }: Props) {
  const state = useShipKits(input);
  const { receipt, toDelivery, quote, needsPayment, paymentChoice, waitingOn, ridersLeft, isSaving } = state;
  // Entered on the frame after mounting, so the panel's transition plays.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const refused = receipt.canSwitch.allowed ? null : receipt.canSwitch.message;
  const isOpen = entered && !isClosing;
  const title = toDelivery ? 'Ship Kits' : 'Back to Pickup';
  const { askRunner, pickedPaid } = state;
  const canSave = !refused && (askRunner || quote.ok) && !waitingOn && ridersLeft.length === 0 && !isSaving;
  const saveLabel = !toDelivery
    ? 'Switch to Pickup'
    : pickedPaid
      ? 'Record & Switch to Delivery'
      : needsPayment
        ? 'Send to Runner'
        : 'Switch to Delivery';
  const close = () => {
    if (!isSaving) onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ship-kits-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-clip ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="ship-kits-title" className="text-xl font-semibold text-primary m-0">{title}</h3>
            <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
              {receipt.orderRef} &middot;{' '}
              {receipt.runners.length === 1 ? receipt.runners[0].name : `all ${receipt.runners.length} runners on this receipt switch together`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex-1 space-y-5 text-sm">
          {refused && <Warning>{refused}</Warning>}

          {/* T12: an address to type only for Already paid (T13). */}
          {!refused && toDelivery && pickedPaid && <DeliveryFields {...state} />}
          {!refused && toDelivery && !pickedPaid && <SendSummary {...state} />}
          {!refused && !toDelivery && <PickupFields {...state} />}

          {!refused && !quote.ok && toDelivery && !askRunner && (
            // An address still being typed is a step left, not an error.
            <p
              className={`${quote.reason === 'ADDRESS_INCOMPLETE' ? 'text-[var(--text-muted)]' : 'text-[var(--status-warning)]'}`}
              role="status"
            >
              {quote.message}
            </p>
          )}
          {!refused && quote.ok && toDelivery && !askRunner && (
            <SwitchQuote
              quote={quote}
              onlineFee={state.onlineFee}
              needsPayment={needsPayment}
              paymentChoice={paymentChoice}
              existingRef={state.refOf}
            />
          )}
          {!refused && <WaitingWarning waitingOn={waitingOn} />}

          {!refused && toDelivery && needsPayment && !waitingOn && <PaymentChoice {...state} />}
          {!refused && toDelivery && needsPayment && !waitingOn && !pickedPaid && (
            // Revision 3: staff need not get the address right; the runner checks it.
            <p className="text-xs text-[var(--text-muted)]">
              The runner gets an email with a link to confirm the address and who receives the kit, change them if
              needed, and pay. Come back to record a GCash or bank payment once their proof is in.
            </p>
          )}

          {!refused && ridersLeft.length === 0 && (
            <div className="space-y-1.5">
              <label htmlFor="ship-kits-reason" className="block text-secondary">
                What the runner asked for <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <input
                id="ship-kits-reason"
                autoComplete="off"
                value={state.reason}
                onChange={e => state.setReason(e.target.value)}
                maxLength={300}
                placeholder={toDelivery ? 'e.g. Asked by Messenger to have the kits delivered' : 'e.g. Will claim the kits at the venue after all'}
                className="form-input w-full text-base"
              />
            </div>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2 min-h-11 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            {refused || ridersLeft.length > 0 ? 'Close' : 'Cancel'}
          </button>
          {!refused && ridersLeft.length === 0 && (
            <button
              type="button"
              onClick={state.save}
              disabled={!canSave}
              className="px-6 py-2 min-h-11 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isSaving ? <BusyLabel>{needsPayment && !state.alreadyPaid ? 'Sending' : 'Switching'}</BusyLabel> : saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
