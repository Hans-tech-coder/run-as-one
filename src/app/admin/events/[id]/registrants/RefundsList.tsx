"use client";

/**
 * The Refunds tab (REFUND_PLAN.md trap 1): a refunded runner has no row in the
 * table or the CSV, so their figures live here: Refunded, Of, Kept, Paid by,
 * Reference. Remittances is what reconciles the money. One card per refund at
 * every width, so it reads on a phone without a second layout.
 *
 * **Record refund** is the moment the runner is emailed; **Void** exists only
 * until then. Both re-read the page after saving.
 */

import React, { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, ReceiptText, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { formatPesos } from '@/lib/money';
import { acceptAttribute, describeUploadTypes } from '@/lib/uploads';
import { MAX_REFUND_REASON, MAX_REFUND_REFERENCE, REFUND_PAID_BY_LABELS, type RefundPaidBy } from '@/lib/refund';
import type { RefundRow } from '@/lib/refund-store';

const CLOSE_MS = 150;

const STATUS_COPY: Record<string, { label: string; badge: string }> = {
  REFUND_DUE: { label: 'To Refund', badge: 'pending' },
  REFUNDED: { label: 'Refunded', badge: 'success' },
  VOIDED: { label: 'Voided', badge: 'neutral' },
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 text-sm text-primary tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function RefundActionModal({
  mode,
  refund,
  onClose,
}: {
  mode: 'record' | 'void';
  refund: RefundRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useAlert();
  const ids = { title: useId(), field: useId() };
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const recording = mode === 'record';
  const needsMoney = recording && refund.amount > 0;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = () => {
    if (saving) return;
    setVisible(false);
    setTimeout(onClose, CLOSE_MS);
  };

  const save = async () => {
    if (needsMoney && !text.trim()) return setError('Enter the GCash or bank reference the refund was sent under.');
    if (needsMoney && !proof) return setError('Attach the proof the refund was sent.');
    if (!recording && !text.trim()) return setError('Say why this refund is being voided.');
    setSaving(true);
    setError('');
    try {
      let res: Response;
      if (recording) {
        const form = new FormData();
        form.set('reference', text);
        if (proof) form.set('proof', proof);
        res = await fetch(`/api/admin/refunds/${refund.id}/record`, { method: 'POST', body: form });
      } else {
        res = await fetch(`/api/admin/refunds/${refund.id}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: text }),
        });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'That could not be saved. Try again.');
        return;
      }
      if (recording) {
        toast({ message:
          body.email?.sent
            ? 'Recorded, and the runner was emailed.'
            : `Recorded, but the email did not send: ${body.email?.error ?? 'unknown error'}.`,
          variant: body.email?.sent ? 'success' : 'error',
        });
      } else {
        toast({ message: `${refund.name} is back on the race.` });
      }
      router.refresh();
      setVisible(false);
      setTimeout(onClose, CLOSE_MS);
    } catch {
      setError('That could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ids.title}
        className={`t-modal admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl max-sm:rounded-none shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] max-sm:max-h-[100dvh] max-sm:h-[100dvh] ${visible ? 'is-open' : 'is-closing'}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id={ids.title} className="text-xl font-semibold text-primary m-0">{recording ? 'Record refund' : 'Void refund'}</h3>
            <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">{refund.name} &middot; ₱{formatPesos(refund.amount)}</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary">
            <X size={20} />
          </button>
        </div>
        <div className="admin-modal-body p-6 max-sm:p-4 space-y-4 overflow-y-auto">
          {recording && refund.amount === 0 ? (
            <p className="m-0 text-sm text-[var(--ink-85)]">Nothing to send for a ₱0.00 refund. Saving closes it and emails the runner.</p>
          ) : (
            <div className="form-group min-w-0 m-0">
              <label htmlFor={ids.field} className="form-label">{recording ? 'GCash or bank reference' : 'Reason'}</label>
              <input
                id={ids.field}
                className="form-input text-base sm:text-sm"
                maxLength={recording ? MAX_REFUND_REFERENCE : MAX_REFUND_REASON}
                value={text}
                onChange={e => setText(e.target.value)}
                disabled={saving}
              />
            </div>
          )}
          {needsMoney && (
            <div className="min-w-0">
              <label className="form-label" htmlFor={`${ids.field}-proof`}>Proof it was sent</label>
              <input
                id={`${ids.field}-proof`}
                type="file"
                accept={acceptAttribute('proof')}
                className="form-input text-base sm:text-sm"
                onChange={e => setProof(e.target.files?.[0] ?? null)}
                disabled={saving}
              />
              <p className="m-0 mt-1 text-xs text-[var(--text-muted)]">{describeUploadTypes('proof')}.</p>
            </div>
          )}
          {!recording && (
            <p className="m-0 text-sm text-[var(--ink-85)]">The runner returns to the race with their add-ons, or this is refused if the race has refilled.</p>
          )}
          {error && <FieldError id="refund-action-error" message={error} />}
        </div>
        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end items-center gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button type="button" onClick={close} disabled={saving} className="btn-cancel bg-transparent border-none cursor-pointer">Cancel</button>
          <button type="button" className="btn-light" onClick={save} disabled={saving}>
            {saving ? <BusyLabel>Saving</BusyLabel> : recording ? 'Record and email' : 'Void refund'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RefundsList({ refunds }: { refunds: RefundRow[] }) {
  const [action, setAction] = useState<{ mode: 'record' | 'void'; refund: RefundRow } | null>(null);

  if (refunds.length === 0) {
    return <p className="m-0 text-sm text-secondary">No runners have been refunded on this race.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {refunds.map(refund => {
        const copy = STATUS_COPY[refund.status] ?? { label: refund.status, badge: 'neutral' };
        return (
          <article key={refund.id} className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel-solid)] p-4 flex flex-col gap-3 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="m-0 text-base font-semibold text-primary [overflow-wrap:anywhere]">{refund.name}</h3>
                <p className="m-0 text-sm text-secondary [overflow-wrap:anywhere]">{refund.ref}</p>
              </div>
              <span className={`status-badge ${copy.badge} shrink-0`}>{copy.label}</span>
            </div>
            <dl className="m-0 grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Fact label="Refunded" value={`₱${formatPesos(refund.amount)}`} />
              <Fact label="Of" value={`₱${formatPesos(refund.of)}`} />
              <Fact label="Kept" value={`₱${formatPesos(refund.kept)}`} />
              <Fact label="Paid by" value={REFUND_PAID_BY_LABELS[refund.paidBy as RefundPaidBy] ?? refund.paidBy} />
              <Fact label="Reference" value={refund.paymentReference ?? 'Not yet paid'} />
            </dl>
            <p className="m-0 text-xs text-[var(--text-muted)] [overflow-wrap:anywhere]">
              {refund.reason} Approved by {refund.approverName}, {refund.approvedOn}.
            </p>
            <div className="flex flex-wrap gap-2">
              <a className="btn-filter is-compact" href={`/api/admin/refunds/${refund.id}/proof?kind=approval`} target="_blank" rel="noreferrer">
                View Approval
              </a>
              {refund.hasPaymentProof && (
                <a className="btn-filter is-compact" href={`/api/admin/refunds/${refund.id}/proof?kind=payment`} target="_blank" rel="noreferrer">
                  View Proof
                </a>
              )}
              {refund.status === 'REFUND_DUE' && (
                <>
                  <button type="button" className="btn-filter is-compact is-primary" onClick={() => setAction({ mode: 'record', refund })}>
                    <ReceiptText size={16} aria-hidden="true" /> Record Refund
                  </button>
                  <button type="button" className="btn-filter is-compact is-danger" onClick={() => setAction({ mode: 'void', refund })}>
                    <Ban size={16} aria-hidden="true" /> Void
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
      {action && <RefundActionModal key={action.refund.id + action.mode} {...action} onClose={() => setAction(null)} />}
    </div>
  );
}
