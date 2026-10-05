"use client";

/**
 * "Log follow-up…" on the Unpaid checkouts tab (UNPAID_FOLLOWUP_PLAN.md Batch
 * 1), and the line each row shows for its latest follow-up.
 *
 * Built on the remarks modal's panel (`RemarksModal.tsx`), not on AlertModal,
 * for that file's reason: a dialog holding inputs must own their state. The
 * outcome is a set of radio tiles rather than a dropdown, because there are
 * only five and a staff member on a phone taps one straight after hanging up.
 *
 * Saving writes one line to the activity trail (lib/follow-up.ts) and reads
 * the page again, so the row and every other staff member's next load show
 * it. Nothing is sent to the runner.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import {
  FOLLOW_UP_LABELS,
  FOLLOW_UP_NOTE_MAX,
  FOLLOW_UP_OUTCOMES,
  type FollowUpOutcome,
} from '@/lib/follow-up';
import type { UnpaidCheckout } from './UnpaidCheckoutsList';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

/**
 * The latest follow-up, as the Follow-up column and the card read it: the
 * outcome, then who and how long ago, then the note in full on phones, where
 * there is no hover to reveal a tooltip.
 */
export function FollowUpSummary({ followUp }: { followUp: UnpaidCheckout['followUp'] }) {
  if (!followUp) {
    return <span className="text-[var(--text-muted)] whitespace-nowrap">Not contacted yet</span>;
  }
  return (
    <span className="block max-w-[14rem]">
      <span className="block font-medium text-primary">{FOLLOW_UP_LABELS[followUp.outcome]}</span>
      <span className="block text-xs text-[var(--text-muted)] [overflow-wrap:anywhere]">
        {followUp.by} · {followUp.ago}
      </span>
      {followUp.note && (
        <span className="block text-xs text-secondary mt-0.5 [overflow-wrap:anywhere]">{followUp.note}</span>
      )}
    </span>
  );
}

/**
 * Mounted when an order is picked and unmounted after it closes, so each
 * order starts from an empty form (the list keys it by order id).
 */
export default function FollowUpModal({
  order,
  onClose,
  onSaved,
}: {
  order: UnpaidCheckout;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { alert, toast } = useAlert();
  const [visible, setVisible] = useState(false);
  const [outcome, setOutcome] = useState<FollowUpOutcome | null>(null);
  const [note, setNote] = useState('');
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

  const save = async () => {
    if (!outcome) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${order.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, note: note.trim() }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: '' }));
        await alert({
          variant: 'error',
          title: 'Follow-up not saved',
          message: error || 'The follow-up could not be saved. Try again.',
        });
        return;
      }
      toast(`Follow-up logged for ${order.orderRef}.`);
      onSaved();
      setVisible(false);
      setTimeout(onClose, CLOSE_MS);
    } catch {
      await alert({
        variant: 'error',
        title: 'Follow-up not saved',
        message: 'Something went wrong while saving the follow-up. Try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const last = order.followUp;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 max-sm:items-start bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        // Top-aligned on a phone, as the remarks modal is, so the keyboard
        // rising for the note never covers Save.
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-up-modal-title"
        className={`t-modal admin-modal-panel w-full max-w-lg bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col ${visible ? 'is-open' : 'is-closing'}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="follow-up-modal-title" className="text-xl font-semibold text-primary m-0">Log follow-up</h3>
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
          <fieldset className="p-0 border-none">
            <legend className="block text-sm text-secondary mb-2 p-0">How did it go?</legend>
            <div className="grid grid-cols-2 gap-2">
              {FOLLOW_UP_OUTCOMES.map(value => {
                const selected = outcome === value;
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
                      name="follow-up-outcome"
                      value={value}
                      checked={selected}
                      onChange={() => setOutcome(value)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                        selected ? 'border-accent-blue bg-accent-blue shadow-[inset_0_0_0_2px_var(--dash-panel-solid)]' : 'border-[var(--ink-30)]'
                      }`}
                    />
                    {FOLLOW_UP_LABELS[value]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="follow-up-note" className="block text-sm text-secondary">
              Note <span className="text-[var(--text-muted)]">(optional)</span>
            </label>
            <textarea
              id="follow-up-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={FOLLOW_UP_NOTE_MAX}
              rows={3}
              placeholder="e.g. Will pay tonight after work. Asked for the link again."
              className="w-full bg-[var(--dash-surface)] border border-[var(--dash-border)] rounded-lg px-4 py-3 text-base text-primary placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--ink-30)] resize-y"
            />
            <p className="text-xs text-[var(--text-muted)] m-0 flex justify-between gap-3">
              <span>Internal only. Nothing is sent to the runner.</span>
              <span className="tabular-nums shrink-0">{note.length}/{FOLLOW_UP_NOTE_MAX}</span>
            </p>
          </div>

          {last && (
            <p className="text-xs text-[var(--text-muted)] m-0">
              Last logged: {FOLLOW_UP_LABELS[last.outcome]} by {last.by}, {last.ago}.
            </p>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end items-center gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !outcome}
            title={outcome ? undefined : 'Choose how it went first'}
            className="px-6 py-2 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving ? <BusyLabel>Saving</BusyLabel> : 'Save follow-up'}
          </button>
        </div>
      </div>
    </div>
  );
}
