"use client";

/**
 * What staff can do with an upgrade still waiting for its payment, in the
 * runner's change history (CATEGORY_CHANGE_PLAN.md Session 3), each on the
 * permission it needs:
 *
 * - **Copy link / Email link** (`registration:email`) — the payment link, for a
 *   chat or by Resend (`…/payment-link`). An email Resend refuses opens the
 *   by-hand send, as the created email does when it fails at opening.
 * - **Record payment** (`registration:validate`) — a GCash or bank payment staff
 *   saw land, with its reference and an optional screenshot, shrunk in the
 *   browser (`compress-proof.ts`). It applies the change at once.
 * - **Cancel change** (`registration:edit`), after a confirm — releases the
 *   held seat; the runner stays where they are.
 *
 * Every answer is the change as the screen reads it, handed back through
 * `onUpdated` so the table's row and the open modal move together.
 */

import React, { useState } from 'react';
import { Copy, Mail, Receipt, XCircle } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { formatPesos } from '@/lib/money';
import { MAX_TRANSACTION_NUMBER, readTransactionNumber } from '@/lib/category-change-hold';
import { compressProof } from '@/lib/compress-proof';
import type { CategoryChangeView } from '@/lib/category-change-view';
import type { RegistrantPermissions } from './RegistrantsTable';
import type { AppliedChange } from './useCategoryChangeModal';
import { ProofPicker } from './CategoryChangePaymentChoice';

function RecordPayment({
  change,
  onRecorded,
  onClose,
}: {
  change: CategoryChangeView;
  onRecorded: (result: AppliedChange) => void;
  onClose: () => void;
}) {
  const { alert } = useAlert();
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ transactionNumber?: string; proofFile?: string }>({});
  const [saving, setSaving] = useState(false);
  const fieldId = `change-payment-${change.id}`;

  const save = async () => {
    const checked = readTransactionNumber(reference);
    if (checked.error) {
      setErrors({ transactionNumber: checked.error });
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.set('transactionNumber', reference);
      if (proof) form.set('proofFile', await compressProof(proof));
      const res = await fetch(`/api/admin/category-changes/${change.id}/record-payment`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.field === 'transactionNumber' || data?.field === 'proofFile') setErrors({ [data.field]: data.error });
        else await alert({ variant: 'error', title: 'Payment Not Recorded', message: data?.error || 'Try again.' });
        return;
      }
      onRecorded(data as AppliedChange);
    } catch {
      await alert({ variant: 'error', title: 'Payment Not Recorded', message: 'Could not reach the server. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--dash-border)] p-3">
      <p className="m-0 text-xs text-secondary">
        Record the ₱{formatPesos(change.amount)} the runner sent by GCash or bank transfer. This moves them to{' '}
        {change.toCategory} at once and emails them.
      </p>
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="block text-secondary">GCash or bank reference number</label>
        <input
          id={fieldId}
          autoComplete="off"
          value={reference}
          onChange={e => {
            setReference(e.target.value);
            setErrors({});
          }}
          maxLength={MAX_TRANSACTION_NUMBER}
          aria-invalid={!!errors.transactionNumber}
          aria-describedby={`${fieldId}-error`}
          className="form-input w-full text-base"
        />
        <FieldError id={`${fieldId}-error`} message={errors.transactionNumber} />
      </div>
      <ProofPicker id={`${fieldId}-proof`} file={proof} onChange={setProof} error={errors.proofFile} />
      <div className="flex gap-2 max-sm:flex-col">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 min-h-11 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] disabled:opacity-50 inline-flex items-center justify-center"
        >
          {saving ? <BusyLabel>Recording</BusyLabel> : `Record ₱${formatPesos(change.amount)} and move`}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-4 min-h-11 text-sm text-secondary hover:text-primary bg-transparent border-none cursor-pointer"
        >
          Never mind
        </button>
      </div>
    </div>
  );
}

export default function AwaitingChangeActions({
  change,
  permissions,
  onUpdated,
  onRecorded,
  onSendEmail,
}: {
  change: CategoryChangeView;
  permissions: RegistrantPermissions;
  onUpdated: (change: CategoryChangeView) => void;
  /** A recorded payment moved the runner: the row's category changes too. */
  onRecorded: (result: AppliedChange) => void;
  onSendEmail: (change: CategoryChangeView, kind: 'applied' | 'created') => void;
}) {
  const { alert, confirm, toast } = useAlert();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<'copy' | 'email' | 'cancel' | null>(null);

  const link = async (via: 'copy' | 'email') => {
    setBusy(via);
    try {
      const res = await fetch(`/api/admin/category-changes/${change.id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ via }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'No Payment Link', message: data?.error || 'Try again.' });
        return;
      }
      if (via === 'copy') {
        try {
          await navigator.clipboard.writeText(data.url);
          toast(`Copied the payment link. It works until ${data.untilLabel}.`);
        } catch {
          await alert({ title: 'Copy this link', message: data.url });
        }
        return;
      }
      if (data.change) onUpdated(data.change);
      if (data.email?.sent) toast(`Emailed the payment link to ${data.email.to}.`);
      else onSendEmail(data.change ?? change, 'created');
    } catch {
      await alert({ variant: 'error', title: 'No Payment Link', message: 'Could not reach the server. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Cancel this change?',
      message: `The runner stays in ${change.fromCategory}, the seat held in ${change.toCategory} is released, and the payment link stops working.`,
      confirmLabel: 'Cancel change',
      // "Cancel" beside "Cancel change" would read as the same thing twice.
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    setBusy('cancel');
    try {
      const res = await fetch(`/api/admin/category-changes/${change.id}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'Change Not Cancelled', message: data?.error || 'Try again.' });
        return;
      }
      onUpdated(data.change);
      toast(`Cancelled ${change.changeRef}. The seat in ${change.toCategory} is free again.`);
    } catch {
      await alert({ variant: 'error', title: 'Change Not Cancelled', message: 'Could not reach the server. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  if (recording) {
    return (
      <RecordPayment
        change={change}
        onClose={() => setRecording(false)}
        onRecorded={result => {
          setRecording(false);
          onRecorded(result);
        }}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {permissions.email && (
        <>
          <button type="button" onClick={() => link('copy')} disabled={busy !== null} className="btn-filter is-compact gap-1.5">
            <Copy size={14} aria-hidden="true" /> {busy === 'copy' ? <BusyLabel>Copying</BusyLabel> : 'Copy payment link'}
          </button>
          <button type="button" onClick={() => link('email')} disabled={busy !== null} className="btn-filter is-compact gap-1.5">
            <Mail size={14} aria-hidden="true" /> {busy === 'email' ? <BusyLabel>Sending</BusyLabel> : 'Email payment link'}
          </button>
        </>
      )}
      {permissions.validate && (
        <button type="button" onClick={() => setRecording(true)} disabled={busy !== null} className="btn-filter is-compact gap-1.5">
          <Receipt size={14} aria-hidden="true" /> Record payment
        </button>
      )}
      {permissions.edit && (
        <button type="button" onClick={cancel} disabled={busy !== null} className="btn-filter is-compact gap-1.5">
          <XCircle size={14} aria-hidden="true" /> {busy === 'cancel' ? <BusyLabel>Cancelling</BusyLabel> : 'Cancel change'}
        </button>
      )}
    </div>
  );
}
