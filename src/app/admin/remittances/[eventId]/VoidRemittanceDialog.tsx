"use client";

import React, { useEffect, useRef, useState } from 'react';
import AlertModal from '@/components/ui/AlertModal';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { MAX_VOID_REASON, describeRemittance, readVoidReason } from '@/lib/settlement';

/**
 * Voiding a remittance — the only correction one can take
 * (ADMIN_MERGE_PLAN.md, Batch 6).
 *
 * `AlertModal`'s danger frame with one real field in it, as `InviteDialog`
 * carries two: **a reason is required**, because a voided line with no
 * explanation tells the next person reading the settlement nothing. The
 * reason is checked by `readVoidReason`, the route's own rule, and the dialog
 * stays open until the void is saved; any other refusal lands under the box.
 */

/** Kept in step with --modal-close-dur in globals.css. */
const CLOSE_MS = 150;

export default function VoidRemittanceDialog({
  remittance,
  onDone,
}: {
  remittance: { id: string; kind: string; amount: number; method: string; paidOn: string };
  /** Called once closed, with whether the remittance was voided. */
  onDone: (voided: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpen(true);
      reasonRef.current?.focus({ preventScroll: true });
    }, 16);
    return () => window.clearTimeout(timer);
  }, []);

  const close = (voided: boolean) => {
    if (closing) return;
    setOpen(false);
    setClosing(true);
    window.setTimeout(() => onDone(voided), CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const submit = async () => {
    if (busy) return;
    const read = readVoidReason(reason);
    if (!read.reason) {
      setError(read.errors.reason ?? '');
      reasonRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/remittances/${remittance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ void: true, reason: read.reason }),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (res.ok) {
        close(true);
      } else {
        setError(data?.errors?.reason ?? data?.error ?? 'The remittance could not be voided. Please try again.');
      }
    } catch {
      setBusy(false);
      setError('Could not reach the server. Check your connection and try again.');
    }
  };

  return (
    <AlertModal
      open={open}
      closing={closing}
      variant="danger"
      title="Void This Remittance"
      showCancel
      busy={busy}
      confirmLabel={busy ? <BusyLabel>Voiding</BusyLabel> : 'Void Remittance'}
      onConfirm={submit}
      onCancel={() => {
        if (!busy) close(false);
      }}
      message={
        <div className="flex flex-col gap-4">
          <p className="m-0">
            The {describeRemittance(remittance)} sent {remittance.paidOn} stops counting toward the balance. It stays
            on the list, marked voided with your reason. If the amount was wrong, record the right one after.
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor="void-reason" className="text-sm font-medium text-primary">
              Reason
            </label>
            <textarea
              ref={reasonRef}
              id="void-reason"
              rows={3}
              maxLength={MAX_VOID_REASON}
              value={reason}
              onChange={e => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              disabled={busy}
              placeholder="Typed ₱15,000 instead of ₱1,500"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'void-reason-error' : undefined}
              className="form-input text-base"
            />
            <FieldError id="void-reason-error" message={error} />
          </div>
        </div>
      }
    />
  );
}
