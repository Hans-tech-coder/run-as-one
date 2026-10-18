"use client";

/**
 * Switch to delivery / Switch to pickup: moving a whole paid order between kit
 * pickup and delivery (LOGISTICS_CHANGE_PLAN.md L2–L13, Session 2), opened
 * from the row menu only when the switch is allowed.
 *
 * **To delivery**, the address starts as Runner 1's home address (every runner
 * gave one at sign-up) and staff edit it, add the ZIP, or ship each kit to its
 * runner's own home when the group lives apart (L2). The customer's other paid
 * pickup orders are listed to tick in (L6): kits going to one address are one
 * parcel and pay one fee. The quote below is live and is the route's own
 * arithmetic (`quoteLogisticsChange`); a parcel whose address already gets a
 * paid delivery rides on it at ₱0 and says which order it ships with.
 *
 * **To pickup** is free and gives nothing back (L9). Orders riding on this
 * one's parcel are ticked to go back with it (L10); unticking one says why the
 * switch cannot be made.
 *
 * A fee keeps the switch waiting for payment (L12) and nothing moves until it
 * is paid. Built on the remarks modal's panel, like Change category; its state
 * and fetches live in `useLogisticsChangeModal.ts`.
 */

import React from 'react';
import { X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { DeliveryFields, PaymentChoice, PickupFields, SwitchQuote, Warning, type SwitchModalProps } from './LogisticsChangeFields';

export default function LogisticsChangeModal(props: SwitchModalProps) {
  const {
    runner,
    preview,
    loadError,
    isOpen,
    isClosing,
    isSaving,
    toDelivery,
    quote,
    needsPayment,
    paymentChoice,
    ridersLeft,
    onClose,
    onSave,
  } = props;

  const refused = preview && !preview.eligibility.allowed ? preview.eligibility : null;
  // Before the preview answers, the row already says which way the order goes.
  const goingToDelivery = preview ? toDelivery : !runner?.isDelivery;
  const title = goingToDelivery ? 'Switch to Delivery' : 'Switch to Pickup';
  const canSave = !!quote?.ok && !refused && ridersLeft.length === 0 && !isSaving;
  const saveLabel = !goingToDelivery ? 'Switch to Pickup' : needsPayment ? 'Save & Await Payment' : 'Switch to Delivery';
  const existingRef = (id: string) => preview?.existing.find(paid => paid.registrationId === id)?.orderRef ?? 'a paid order';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isOpen && !isClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="logistics-change-title"
        className={`t-modal admin-modal-panel admin-modal-sheet w-full max-w-xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-clip ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="logistics-change-title" className="text-xl font-semibold text-primary m-0">{title}</h3>
            {runner && (
              <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
                Order {runner.orderRef}
                {preview && preview.order.runners.length > 1 ? ` · ${preview.order.runners.length} runners` : ` · ${runner.name}`}
              </p>
            )}
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
          {loadError && <p role="alert" className="m-0 text-[var(--status-danger)]">{loadError}</p>}
          {!preview && !loadError && (
            <p className="m-0 text-[var(--text-muted)]"><BusyLabel>Loading this order</BusyLabel></p>
          )}
          {refused && <Warning>{refused.message}</Warning>}

          {preview && !refused && toDelivery && <DeliveryFields {...props} />}
          {preview && !refused && !toDelivery && <PickupFields {...props} />}

          {preview && !refused && quote && !quote.ok && toDelivery && (
            <p className="m-0 text-[var(--status-warning)]" role="status">{quote.message}</p>
          )}
          {preview && !refused && quote?.ok && toDelivery && (
            <SwitchQuote
              quote={quote}
              onlineFee={props.onlineFee}
              needsPayment={needsPayment}
              paymentChoice={paymentChoice}
              existingRef={existingRef}
            />
          )}

          {preview && !refused && quote?.ok && needsPayment && <PaymentChoice {...props} />}

          {preview && !refused && (
            <div className="space-y-1.5">
              <label htmlFor="logistics-change-reason" className="block text-secondary">
                What the runner asked for <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <input
                id="logistics-change-reason"
                autoComplete="off"
                value={props.reason}
                onChange={e => props.setReason(e.target.value)}
                maxLength={300}
                placeholder={toDelivery ? 'e.g. Asked by Messenger to have the kit delivered' : 'e.g. Will claim the kit at the venue after all'}
                className="form-input w-full text-base"
              />
            </div>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-11 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            {refused || loadError ? 'Close' : 'Cancel'}
          </button>
          {!refused && !loadError && (
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="px-6 py-2 min-h-11 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isSaving ? <BusyLabel>{needsPayment ? 'Saving' : 'Switching'}</BusyLabel> : saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
