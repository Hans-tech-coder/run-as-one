"use client";

/**
 * "Cancel order…" on the Unpaid checkouts tab (UNPAID_FOLLOWUP_PLAN.md Batch
 * 2): closes an unpaid online order the runner has said no to, so its slot and
 * promo go back now instead of at the next nightly sweep.
 *
 * **A reason is required**, because a cancelled order is the one a staff
 * member will later be asked about. It is sent with the status change and
 * written into that change's trail line (the status route's `reason`), so the
 * trail says why, not only who. The common reasons are tiles, as the follow-up
 * outcomes are; "Other" takes the staff member's own words.
 *
 * **It goes through the existing status route**, PENDING → CANCELLED, which
 * already frees the slot (only PAID and PENDING hold one) and hands the promo
 * back (`releaseRedemption`). It sends `expectedStatus: 'PENDING'`, so an
 * order paid while this dialog was open is refused rather than cancelled.
 * Nothing is sent to the runner.
 *
 * Built on the follow-up modal's panel for that file's reason: a dialog
 * holding inputs must own their state.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import type { UnpaidCheckout } from './UnpaidCheckoutsList';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

/** Kept in step with the status route's `REASON_MAX`. */
const REASON_MAX = 200;

const OTHER = 'Other';
const REASONS = ['Runner declined', 'Duplicate order', 'Test order', OTHER] as const;
type Reason = (typeof REASONS)[number];

/**
 * Mounted when an order is picked and unmounted after it closes, so each
 * order starts from an empty form (the list keys it by order id).
 */
export default function CancelOrderModal({
  order,
  onClose,
  onCancelled,
}: {
  order: UnpaidCheckout;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { alert, toast } = useAlert();
  const [visible, setVisible] = useState(false);
  const [choice, setChoice] = useState<Reason | null>(null);
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);

  // One frame after mount, so the panel's opening transition runs.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = () => {
    if (saving) return;
    setVisible(false);
    setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const reason = choice === OTHER ? other.trim() : choice ?? '';
  const missing = !choice
    ? 'Choose why the order is being cancelled first'
    : !reason
      ? 'Say why in the box under Other first'
      : null;

  const confirm = async () => {
    if (missing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', expectedStatus: 'PENDING', reason }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: '' }));
        await alert({
          variant: 'error',
          title: 'Order not cancelled',
          message: error || 'The order could not be cancelled. Try again.',
        });
        // A 409 means the order moved (paid or expired); the page is read
        // again so the row shows where it stands.
        if (res.status === 409) onCancelled();
        return;
      }
      toast(`Cancelled ${order.orderRef}. Its slot is free again.`);
      onCancelled();
      setVisible(false);
      setTimeout(onClose, CLOSE_MS);
    } catch {
      await alert({
        variant: 'error',
        title: 'Order not cancelled',
        message: 'Something went wrong while cancelling the order. Try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const runners = order.runnerNames.length;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 max-sm:items-start bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        // Top-aligned on a phone, as the follow-up modal is, so the keyboard
        // rising for "Other" never covers the button.
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-modal-title"
        className={`t-modal admin-modal-panel w-full max-w-lg bg-[var(--dash-panel-solid)] border border-red-500/20 rounded-2xl shadow-2xl flex flex-col ${visible ? 'is-open' : 'is-closing'}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="cancel-order-modal-title" className="text-xl font-semibold text-primary m-0">Cancel order</h3>
            <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
              Order {order.orderRef} &middot; {order.contactName}
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

        <div className="admin-modal-body p-6 max-sm:p-4 space-y-4">
          {/* No m-0: it would cancel the space-y gap below this line. */}
          <p className="text-sm text-[var(--ink-85)]">
            The {runners === 1 ? 'slot goes' : `${runners} slots go`} back now, and a promo code the
            order used is handed back. If the runner pays later, the payment is not accepted on its
            own; it is logged for a refund. Nothing is sent to the runner.
          </p>

          <fieldset className="p-0 border-none">
            <legend className="block text-sm text-secondary mb-2 p-0">Why is it being cancelled?</legend>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map(value => {
                const selected = choice === value;
                return (
                  <label
                    key={value}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ink-30)] ${
                      selected
                        ? 'border-accent-blue bg-accent-blue/10 text-primary font-medium'
                        : 'border-[var(--dash-border)] bg-[var(--ink-02)] text-[var(--ink-85)] hover:border-[var(--ink-20)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancel-order-reason"
                      value={value}
                      checked={selected}
                      onChange={() => setChoice(value)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                        selected ? 'border-accent-blue bg-accent-blue shadow-[inset_0_0_0_2px_var(--dash-panel-solid)]' : 'border-[var(--ink-30)]'
                      }`}
                    />
                    {value}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {choice === OTHER && (
            <div className="space-y-2">
              <label htmlFor="cancel-order-other" className="block text-sm text-secondary">
                The reason
              </label>
              <textarea
                id="cancel-order-other"
                value={other}
                onChange={e => setOther(e.target.value)}
                maxLength={REASON_MAX}
                rows={2}
                autoFocus
                placeholder="e.g. Runner moved to the 10K and registered again."
                className="w-full bg-[var(--dash-surface)] border border-[var(--dash-border)] rounded-lg px-4 py-3 text-base text-primary placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--ink-30)] resize-y"
              />
              <p className="text-xs text-[var(--text-muted)] m-0 flex justify-between gap-3">
                <span>Saved in the activity trail with the cancel.</span>
                <span className="tabular-nums shrink-0">{other.length}/{REASON_MAX}</span>
              </p>
            </div>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end items-center gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            Keep order
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || missing !== null}
            title={missing ?? undefined}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving ? <BusyLabel>Cancelling</BusyLabel> : 'Cancel order'}
          </button>
        </div>
      </div>
    </div>
  );
}
