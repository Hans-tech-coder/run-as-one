"use client";

/**
 * **Refund runner** (REFUND_PLAN.md): what is refunded, what is kept, what
 * happens to the promo and who pays, shown before anything is saved. The rule
 * and the figures are the server's (`GET /api/admin/runners/[id]/refund`); the
 * amount is a field only on a Buy X get Y order (D10). Save opens `StepUpDialog`,
 * and its one-use token is kept for a retry after a refusal that did not spend it.
 *
 * Mounted while a runner is picked, so each one starts from its own figures. The
 * screen re-reads itself after a save, which takes the runner off the table.
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2, UploadCloud, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, acceptAttribute, allowedTypes, describeUploadTypes } from '@/lib/uploads';
import { useImageCompression } from '@/lib/image-compress';
import { formatPesos } from '@/lib/money';
import { today } from '@/lib/event-schedule';
import { parsePesos } from '@/lib/settlement';
import {
  MAX_APPROVER_NAME,
  MAX_REFUND_REASON,
  REFUND_PAID_BY,
  REFUND_PAID_BY_LABELS,
  defaultPaidBy,
  refundTotal,
  type RefundPaidBy,
  type RefundQuote,
} from '@/lib/refund';
import AdminDatePicker from '../../../AdminDatePicker';
import StepUpDialog from '../../../StepUpDialog';
import type { RegistrantRow } from './RegistrantsTable';

const CLOSE_MS = 150;

type QuoteResponse = {
  quote: RefundQuote;
  balance: number;
  status: string;
  orderRef: string;
  blocked: string | null;
  promos: { code: string; returns: boolean }[];
};

type Errors = Partial<Record<'reason' | 'approverName' | 'approvedOn' | 'paidBy' | 'entryAmount' | 'approvalProof', string>>;

function Row({ label, centavos, strong }: { label: string; centavos: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 text-sm ${strong ? 'font-semibold text-primary' : 'text-[var(--ink-85)]'}`}>
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      <span className="shrink-0 tabular-nums">₱{formatPesos(centavos)}</span>
    </div>
  );
}

export default function RunnerRefundModal({ runner, onClose }: { runner: RegistrantRow; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useAlert();
  const ids = { title: useId(), reason: useId(), approver: useId(), amount: useId() };
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<QuoteResponse | 'loading' | 'failed'>('loading');
  const [entryAmount, setEntryAmount] = useState('');
  const [reason, setReason] = useState('');
  const [approverName, setApproverName] = useState('');
  const [approvedOn, setApprovedOn] = useState(today());
  const [paidBy, setPaidBy] = useState<RefundPaidBy>(REFUND_PAID_BY.RUN_AS_ONE);
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const token = useRef<string | null>(null);
  const { optimizing, compress } = useImageCompression('proof');

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/runners/${runner.id}/refund`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('refused'))))
      .then((body: QuoteResponse) => {
        if (!live) return;
        setData(body);
        setPaidBy(defaultPaidBy(body.balance, body.quote));
      })
      .catch(() => live && setData('failed'));
    return () => {
      live = false;
    };
  }, [runner.id]);

  const close = () => {
    if (saving) return;
    setVisible(false);
    setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !stepUpOpen) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const pickFile = async (picked: File | null) => {
    setErrors(prev => ({ ...prev, approvalProof: undefined }));
    if (!picked) return;
    if (!allowedTypes('proof').includes(picked.type)) {
      setErrors(prev => ({ ...prev, approvalProof: `The approval must be a ${describeUploadTypes('proof')} file.` }));
      return;
    }
    const file = await compress(picked);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrors(prev => ({ ...prev, approvalProof: `The approval must be ${MAX_UPLOAD_MB} MB or smaller.` }));
      return;
    }
    setProof(file);
  };

  const quote = data !== 'loading' && data !== 'failed' ? data.quote : null;
  const entry = quote
    ? entryAmount.trim() === ''
      ? quote.suggestedAmount
      : parsePesos(entryAmount)
    : null;

  const validate = (): boolean => {
    const next: Errors = {};
    if (!reason.trim()) next.reason = 'Say why this runner is being refunded.';
    if (!approverName.trim()) next.approverName = 'Enter who approved this for the organizer.';
    if (!approvedOn) next.approvedOn = 'Enter the day it was approved.';
    if (!proof) next.approvalProof = "Attach the organizer's approval.";
    if (quote && (entry === null || entry > quote.suggestedAmount)) {
      next.entryAmount = `Enter an amount from ₱0.00 to ₱${formatPesos(quote.suggestedAmount)}.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (stepUpToken: string) => {
    setSaving(true);
    setFormError('');
    try {
      const form = new FormData();
      form.set('reason', reason);
      form.set('approverName', approverName);
      form.set('approvedOn', approvedOn);
      form.set('paidBy', paidBy);
      if (quote?.editable) form.set('entryAmount', entryAmount);
      form.set('expectedStatus', 'PAID');
      form.set('stepUpToken', stepUpToken);
      if (proof) form.set('approvalProof', proof);
      const res = await fetch(`/api/admin/runners/${runner.id}/refund`, { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) {
        token.current = null;
        setStepUpOpen(true);
        return;
      }
      if (!res.ok) {
        if (body.field && body.field in ({ reason: 1, approverName: 1, approvedOn: 1, paidBy: 1, entryAmount: 1, approvalProof: 1 })) {
          setErrors(prev => ({ ...prev, [body.field]: body.error }));
        } else {
          setFormError(body.error ?? 'The refund could not be saved. Try again.');
        }
        return;
      }
      token.current = null;
      toast({ message: `${runner.name} is on the Refunds tab: ₱${formatPesos(body.amount)} to pay.` });
      router.refresh();
      setVisible(false);
      setTimeout(onClose, CLOSE_MS);
    } catch {
      setFormError('The refund could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!validate()) return;
    if (token.current) void submit(token.current);
    else setStepUpOpen(true);
  };

  const ready = data !== 'loading' && data !== 'failed' && !data.blocked;
  const total = quote && entry !== null ? refundTotal(entry, quote) : 0;
  const kept = quote && entry !== null ? quote.suggestedAmount - entry : 0;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-0 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
          visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={ids.title}
          className={`t-modal admin-modal-panel w-full max-w-2xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl max-sm:rounded-none shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] max-sm:max-h-[100dvh] max-sm:h-[100dvh] ${visible ? 'is-open' : 'is-closing'}`}
        >
          <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
            <div className="min-w-0">
              <h3 id={ids.title} className="text-xl font-semibold text-primary m-0">Refund runner</h3>
              <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">{runner.runnerRef} &middot; {runner.name}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary"
            >
              <X size={20} />
            </button>
          </div>

          <div className="admin-modal-body p-6 max-sm:p-4 space-y-5 overflow-y-auto">
            {data === 'loading' && <p role="status" className="m-0 text-sm text-secondary"><BusyLabel>Working out the refund</BusyLabel></p>}
            {data === 'failed' && <FieldError id="refund-load-error" message="The refund figures could not be loaded. Close this and try again." />}
            {data !== 'loading' && data !== 'failed' && data.blocked && <FieldError id="refund-blocked" message={data.blocked} />}

            {ready && quote && typeof data === 'object' && (
              <>
                <section className="space-y-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-sunken)] px-4 py-3">
                  <h4 className="m-0 text-sm font-semibold text-primary">Refunded to the runner</h4>
                  <Row label={quote.freeEntry ? 'Entry (free seat)' : 'Entry as paid'} centavos={entry ?? 0} />
                  {quote.addOnOrganizerAmount > 0 && <Row label="Add-ons sold by the organizer" centavos={quote.addOnOrganizerAmount} />}
                  {quote.addOnRunAsOneAmount > 0 && <Row label="Add-ons sold by Run As One" centavos={quote.addOnRunAsOneAmount} />}
                  <Row label="Total refund" centavos={total} strong />
                </section>

                <section className="space-y-2 rounded-lg border border-[var(--dash-border)] px-4 py-3">
                  <h4 className="m-0 text-sm font-semibold text-primary">Not returned</h4>
                  <Row label="Platform fee" centavos={quote.keptAdminFee} />
                  {quote.keptDeliveryFee > 0 && <Row label="Delivery fee" centavos={quote.keptDeliveryFee} />}
                  {quote.keptTransactionFee > 0 && <Row label="Transaction fee" centavos={quote.keptTransactionFee} />}
                  {kept > 0 && <Row label="Stays with the organizer" centavos={kept} />}
                  {data.promos.map(promo => (
                    <p key={promo.code} className="m-0 text-xs text-[var(--text-muted)] [overflow-wrap:anywhere]">
                      {promo.returns
                        ? `Promo ${promo.code} is still active, so what this runner used goes back.`
                        : `Promo ${promo.code} is no longer active, so nothing goes back to it.`}
                    </p>
                  ))}
                </section>

                {quote.editable && (
                  <div className="form-group min-w-0 m-0">
                    <label htmlFor={ids.amount} className="form-label">Entry to refund</label>
                    <input
                      id={ids.amount}
                      className="form-input text-base sm:text-sm"
                      inputMode="decimal"
                      placeholder={formatPesos(quote.suggestedAmount)}
                      value={entryAmount}
                      onChange={e => setEntryAmount(e.target.value)}
                      disabled={saving}
                      aria-invalid={errors.entryAmount ? true : undefined}
                    />
                    <p className="m-0 mt-1 text-xs text-[var(--text-muted)]">
                      A Buy X get Y order may refund less than ₱{formatPesos(quote.suggestedAmount)}, never more.
                    </p>
                    <FieldError id="refund-amount-error" message={errors.entryAmount} />
                  </div>
                )}

                <fieldset className="m-0 border-0 p-0 min-w-0">
                  <legend className="form-label">Who pays the runner</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([REFUND_PAID_BY.RUN_AS_ONE, REFUND_PAID_BY.ORGANIZER] as RefundPaidBy[]).map(option => (
                      <label key={option} className="flex items-start gap-3 rounded-lg border border-[var(--dash-border)] px-3 py-2.5 min-h-11 cursor-pointer">
                        <input type="radio" name="refund-paid-by" className="mt-0.5" checked={paidBy === option} onChange={() => setPaidBy(option)} disabled={saving} />
                        <span className="text-sm text-primary">{REFUND_PAID_BY_LABELS[option]}</span>
                      </label>
                    ))}
                  </div>
                  <p className="m-0 mt-1 text-xs text-[var(--text-muted)]">
                    ₱{formatPesos(Math.max(0, data.balance))} is still held for this race&apos;s organizer. Already remitted means the organizer pays and sends proof.
                  </p>
                </fieldset>

                <div className="form-group min-w-0 m-0">
                  <label htmlFor={ids.reason} className="form-label">Reason</label>
                  <textarea
                    id={ids.reason}
                    className="form-input text-base sm:text-sm"
                    rows={2}
                    maxLength={MAX_REFUND_REASON}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    disabled={saving}
                    aria-invalid={errors.reason ? true : undefined}
                  />
                  <FieldError id="refund-reason-error" message={errors.reason} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="form-group min-w-0 m-0">
                    <label htmlFor={ids.approver} className="form-label">Approved by (organizer)</label>
                    <input
                      id={ids.approver}
                      className="form-input text-base sm:text-sm"
                      maxLength={MAX_APPROVER_NAME}
                      value={approverName}
                      onChange={e => setApproverName(e.target.value)}
                      disabled={saving}
                      aria-invalid={errors.approverName ? true : undefined}
                    />
                    <FieldError id="refund-approver-error" message={errors.approverName} />
                  </div>
                  <AdminDatePicker
                    label="Date approved"
                    value={approvedOn}
                    onChange={setApprovedOn}
                    max={today()}
                    error={errors.approvedOn}
                  />
                </div>

                <div className="min-w-0">
                  <span className="form-label">Organizer&apos;s approval</span>
                  {proof ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--dash-border)] px-3 py-2">
                      <span className="min-w-0 text-sm text-primary [overflow-wrap:anywhere]">{proof.name}</span>
                      <button type="button" className="btn-filter max-lg:min-h-11 shrink-0" onClick={() => setProof(null)} disabled={saving}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="file-upload-wrapper" style={{ padding: '1.25rem' }}>
                      <input
                        type="file"
                        accept={acceptAttribute('proof')}
                        className="file-upload-input"
                        onChange={e => pickFile(e.target.files?.[0] ?? null)}
                        disabled={saving}
                        aria-label="Upload the organizer's approval"
                      />
                      <div className="file-upload-content">
                        <UploadCloud size={24} className="text-accent-blue-ink" aria-hidden="true" />
                        <div className="text-sm text-primary">Upload a screenshot of the approval</div>
                        <div className="text-xs">{describeUploadTypes('proof')}, up to {MAX_UPLOAD_MB} MB.</div>
                      </div>
                    </div>
                  )}
                  {optimizing && <p role="status" className="m-0 text-sm text-secondary"><BusyLabel>Optimizing image</BusyLabel></p>}
                  <FieldError id="refund-proof-error" message={errors.approvalProof} />
                </div>

                <p className="m-0 text-xs text-[var(--text-muted)]">
                  The runner leaves the registrants list and their slot and add-ons free up now. The money is paid by hand; record it on the Refunds tab to email the runner.
                </p>
                {formError && <FieldError id="refund-form-error" message={formError} />}
              </>
            )}
          </div>

          <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end items-center gap-3 bg-[var(--dash-sunken)] shrink-0">
            <button type="button" onClick={close} disabled={saving} className="btn-cancel bg-transparent border-none cursor-pointer">
              Cancel
            </button>
            <button type="button" className="btn-light" onClick={save} disabled={!ready || saving || optimizing}>
              <Undo2 size={16} aria-hidden="true" />
              {saving ? <BusyLabel>Saving</BusyLabel> : 'Confirm and refund'}
            </button>
          </div>
        </div>
      </div>

      <StepUpDialog
        open={stepUpOpen}
        action="runner.refund"
        targetId={runner.id}
        what="refunding this runner"
        onConfirmed={stepUpToken => {
          token.current = stepUpToken;
          setStepUpOpen(false);
          void submit(stepUpToken);
        }}
        onCancel={() => setStepUpOpen(false)}
      />
    </>
  );
}

/** The picked runner and the modal, as the table's other row modals are held. */
export function useRunnerRefund({ runners }: { runners: RegistrantRow[] }) {
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const runner = runnerId ? runners.find(r => r.id === runnerId) ?? null : null;
  const element = runner ? <RunnerRefundModal key={runner.id} runner={runner} onClose={() => setRunnerId(null)} /> : null;
  return { open: setRunnerId, element };
}
