"use client";

/**
 * Remarks Modal.
 *
 * Built from the same panel the edit and delete modals use rather than a
 * browser prompt(): an OS dialog ignores the dark palette entirely and
 * blocks the thread, which is exactly why AlertProvider replaced
 * window.alert. It is not AlertModal itself because that dialog carries a
 * message, not an input - a textarea inside its ReactNode message would be
 * captured at enqueue time and go stale on the first keystroke.
 *
 * Internal by design. Saving a note sends nothing to the runner; an
 * assigned staff member follows up by hand.
 *
 * Split out of `RegistrantsTable.tsx` (UNPAID_ORDERS_PLAN.md Batch 2) with its
 * state: `useRemarksModal` holds the draft and the save, and hands the saved
 * note back through `onSaved` so the table can update every row it holds.
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import type { RegistrantRow } from './RegistrantsTable';

type SavedRemarks = { remarks: string | null; remarksBy: string | null; remarksAt: string | null };

/**
 * The note belongs to the registration, not the runner, so the row is only
 * how the organizer reached it — a group of five shares one note, and the
 * modal says so.
 */
export function useRemarksModal({
  runners,
  onSaved,
}: {
  runners: RegistrantRow[];
  onSaved: (registrationId: string, registration: SavedRemarks) => void;
}) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const [remarkingRunner, setRemarkingRunner] = useState<any | null>(null);
  const [remarksDraft, setRemarksDraft] = useState('');
  const [isRemarksOpen, setIsRemarksOpen] = useState(false);
  const [isRemarksClosing, setIsRemarksClosing] = useState(false);
  const [isSavingRemarks, setIsSavingRemarks] = useState(false);

  const openRemarksModal = (runnerId: string) => {
    const runner = runners.find(r => r.id === runnerId);
    if (!runner) return;
    setRemarkingRunner(runner);
    setRemarksDraft(runner.remarks || '');
    setIsRemarksOpen(true);
  };

  const closeRemarksModal = () => {
    setIsRemarksOpen(false);
    setIsRemarksClosing(true);
    setTimeout(() => {
      setIsRemarksClosing(false);
      setRemarkingRunner(null);
      setRemarksDraft('');
    }, 150);
  };

  const handleRemarksSave = async () => {
    if (!remarkingRunner) return;
    const registrationId = remarkingRunner.registrationId;
    const text = remarksDraft.trim();

    setIsSavingRemarks(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: text }),
      });

      if (res.ok) {
        const { registration } = await res.json();
        onSaved(registrationId, registration);
        closeRemarksModal();
      } else {
        const { error } = await res.json().catch(() => ({ error: '' }));
        alert({
          variant: 'error',
          title: 'Remarks Not Saved',
          message: error || 'The remarks could not be saved. Please try again.',
        });
      }
    } catch (e) {
      console.error(e);
      alert({
        variant: 'error',
        title: 'Remarks Not Saved',
        message: 'Something went wrong while saving the remarks. Please try again.',
      });
    } finally {
      setIsSavingRemarks(false);
    }
  };

  const orderSize = remarkingRunner
    ? runners.filter(r => r.registrationId === remarkingRunner.registrationId).length
    : 0;

  return {
    open: openRemarksModal,
    modalProps: {
      runner: remarkingRunner,
      orderSize,
      draft: remarksDraft,
      setDraft: setRemarksDraft,
      isOpen: isRemarksOpen,
      isClosing: isRemarksClosing,
      isSaving: isSavingRemarks,
      onClose: closeRemarksModal,
      onSave: handleRemarksSave,
    },
  };
}

export default function RemarksModal({
  runner: remarkingRunner,
  orderSize,
  draft: remarksDraft,
  setDraft: setRemarksDraft,
  isOpen: isRemarksOpen,
  isClosing: isRemarksClosing,
  isSaving: isSavingRemarks,
  onClose: closeRemarksModal,
  onSave: handleRemarksSave,
}: ReturnType<typeof useRemarksModal>['modalProps']) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 max-sm:items-start bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isRemarksOpen && !isRemarksClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        // Top-aligned on a phone rather than centred: the on-screen keyboard
        // rises over the lower half of the screen, and a panel standing at
        // the top keeps Save above it while the note is being typed.
        role="dialog"
        aria-modal="true"
        aria-labelledby="remarks-modal-title"
        className={`t-modal admin-modal-panel w-full max-w-lg bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col ${isRemarksOpen ? 'is-open' : ''} ${isRemarksClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="remarks-modal-title" className="text-xl font-semibold text-primary m-0">Payment Remarks</h3>
            {remarkingRunner && (
              <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
                Order {remarkingRunner.orderRef} &middot;{' '}
                {orderSize > 1
                  ? `${orderSize} runners`
                  : remarkingRunner.name}
              </p>
            )}
          </div>
          <button
            onClick={closeRemarksModal}
            aria-label="Close"
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 space-y-3">
          <label htmlFor="registration-remarks" className="block text-sm text-secondary">
            What did you find when you checked this payment?
          </label>
          <textarea
            id="registration-remarks"
            value={remarksDraft}
            onChange={e => setRemarksDraft(e.target.value)}
            rows={5}
            placeholder="e.g. Deposit slip is for ₱1,200 but the order total is ₱1,500. Called the runner on 09/06."
            className="w-full bg-[var(--dash-surface)] border border-[var(--dash-border)] rounded-lg px-4 py-3 text-base text-primary placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--ink-30)] resize-y"
          />
          <p className="text-xs text-[var(--text-muted)] m-0">
            Internal only. The runner is never shown this and no email is sent
            {remarkingRunner && orderSize > 1
              ? '. It applies to every runner on this order.'
              : '.'}
          </p>
          {remarkingRunner?.remarksBy && remarkingRunner?.remarksAt && (
            <p className="text-xs text-[var(--text-muted)] m-0">
              Last written by {remarkingRunner.remarksBy} on{' '}
              {new Date(remarkingRunner.remarksAt).toLocaleString()}.
            </p>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={closeRemarksModal}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRemarksSave}
            disabled={isSavingRemarks || (!remarksDraft.trim() && !remarkingRunner?.remarks)}
            className="px-6 py-2 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {isSavingRemarks
              ? <BusyLabel>Saving</BusyLabel>
              : !remarksDraft.trim() && remarkingRunner?.remarks
                ? 'Clear Remarks'
                : 'Save Remarks'}
          </button>
        </div>
      </div>
    </div>
  );
}
