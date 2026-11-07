"use client";

/**
 * **Correct payment** (PAYMENT_CORRECTION_PLAN.md Batch 2): fix a wrong
 * Transaction No. or a wrong proof of payment on a bank-transfer order that is
 * pending or paid. The rule lives in `lib/payment-correction.ts`; this is the
 * screen in front of `POST /api/admin/registrations/[id]/payment`.
 *
 * - What is on file sits beside what replaces it, so staff see the before and
 *   after before they save. The method is shown, never picked: a manual order
 *   is always a bank transfer (Batch 1's hand-over).
 * - A reason is always written (C4) and goes into the trail line.
 * - **A paid order needs a fresh confirmation** (C2a): Save opens
 *   `StepUpDialog` first and sends its one-use token. The token is kept for a
 *   retry after a 400 / 409 (the route spends it only when it saves), and
 *   dropped after a 200 or a 403; a 403 opens the dialog again. A pending
 *   order takes a plain confirm.
 * - The runner hears nothing unless the resend tick is on (C6, paid only).
 * - The amount and the status are never touched (C8).
 *
 * Mounted while an order is picked (`usePaymentCorrection`), so each one
 * starts from its own values.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileText, ReceiptText, UploadCloud, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, PDF_TYPE, acceptAttribute, allowedTypes, describeUploadTypes } from '@/lib/uploads';
import { useImageCompression } from '@/lib/image-compress';
import { CORRECTION_REASON_MAX } from '@/lib/payment-correction-rules';
import StepUpDialog from '../../../StepUpDialog';
import ProofPreview from './ProofPreview';
import ProofLightbox from './ProofLightbox';
import { statusPillClass } from './registrant-display';
import type { RegistrantRow } from './RegistrantsTable';
import type { PaymentCorrected } from './registrant-row-patches';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

/** Kept in step with `MAX_TRANSACTION_NUMBER` in lib/category-change-hold.ts. */
const MAX_REFERENCE = 100;

const FIELD_LABELS: Record<string, string> = {
  transactionNumber: 'Transaction No.',
  proofOfPayment: 'proof of payment',
};

/** "the Transaction No. and proof of payment", for the toast. */
function correctedWords(fields: string[]): string {
  const words = fields.map(field => FIELD_LABELS[field] ?? field);
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0] ?? 'payment';
}

export default function PaymentCorrectionModal({
  runner,
  contactEmail,
  onClose,
  onCorrected,
}: {
  /** The row the menu was opened on; the order is its `registrationId`. */
  runner: RegistrantRow;
  /** Where a resent receipt goes: the order's first runner. */
  contactEmail: string | null;
  onClose: () => void;
  onCorrected: (registrationId: string, saved: PaymentCorrected) => void;
}) {
  const { confirm, toast } = useAlert();
  const ids = { title: useId(), ref: useId(), reason: useId(), resend: useId() };
  const isPaid = runner.status === 'PAID';
  const currentRef: string = runner.transactionNumber ?? '';

  const [visible, setVisible] = useState(false);
  const [reference, setReference] = useState(currentRef);
  const [proof, setProof] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [resend, setResend] = useState(false);
  const [errors, setErrors] = useState<{ proof?: string; reason?: string }>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  // The step-up token, held for a retry after a refusal that did not spend it.
  const token = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { optimizing, compress } = useImageCompression('proof');

  // One frame after mount, so the panel's opening transition runs.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The picked image, previewed; its object URL freed when it is replaced.
  const proofUrl = useMemo(() => (proof && proof.type !== PDF_TYPE ? URL.createObjectURL(proof) : null), [proof]);
  useEffect(() => () => {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
  }, [proofUrl]);

  const close = () => {
    if (saving) return;
    setVisible(false);
    setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The step-up dialog and the lightbox answer their own Escape.
      if (event.key === 'Escape' && !stepUpOpen && !lightbox) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const pickFile = async (picked: File | null) => {
    setErrors(prev => ({ ...prev, proof: undefined }));
    setFormError('');
    if (!picked) return;
    if (!allowedTypes('proof').includes(picked.type)) {
      setErrors(prev => ({ ...prev, proof: `The proof must be a ${describeUploadTypes('proof')} file.` }));
      return;
    }
    const file = await compress(picked);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrors(prev => ({ ...prev, proof: `The proof must be ${MAX_UPLOAD_MB} MB or smaller.` }));
      return;
    }
    setProof(file);
  };

  const removeFile = () => {
    setProof(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const trimmedRef = reference.trim();
  const refChanged = trimmedRef !== '' && trimmedRef !== currentRef;
  const nothingToSave = !refChanged && !proof;

  const submit = async (stepUpToken: string | null) => {
    setSaving(true);
    setFormError('');
    try {
      const form = new FormData();
      form.set('reason', reason.trim());
      form.set('expectedStatus', runner.status);
      if (refChanged) form.set('transactionNumber', trimmedRef);
      if (proof) form.set('proofFile', proof);
      if (isPaid) {
        if (stepUpToken) form.set('stepUpToken', stepUpToken);
        if (resend) form.set('resendReceipt', 'true');
      }
      const res = await fetch(`/api/admin/registrations/${runner.registrationId}/payment`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        token.current = null;
        const saved: PaymentCorrected = {
          changes: data.changes ?? {},
          receipt: data.receipt ?? null,
          by: data.by,
          at: data.at,
        };
        onCorrected(runner.registrationId, saved);
        const what = `Corrected the ${correctedWords(data.corrected ?? Object.keys(saved.changes))} on ${runner.orderRef}.`;
        if (saved.receipt && !saved.receipt.sent) {
          toast({
            variant: 'info',
            title: what,
            message: `The receipt was not sent${saved.receipt.error ? `: ${saved.receipt.error}` : '.'} Send it from the row's email button.`,
            duration: 9000,
          });
        } else {
          toast({
            title: what,
            message: saved.receipt?.sent
              ? `The receipt was sent again${contactEmail ? ` to ${contactEmail}` : ''}.`
              : 'Nothing was sent to the runner.',
          });
        }
        setSaving(false);
        setVisible(false);
        setTimeout(onClose, CLOSE_MS);
        return;
      }

      // 403: the confirmation was missing, spent or for another order.
      if (res.status === 403 && isPaid) {
        token.current = null;
        setFormError(data.error || "Confirm it's you again to save.");
        setStepUpOpen(true);
      } else {
        // 400 / 404 / 409: the server's own sentence; a held token stays good.
        setFormError(data.error || 'The correction could not be saved. Try again.');
      }
    } catch {
      setFormError('Something went wrong while saving the correction. Try again.');
    }
    setSaving(false);
  };

  const save = async () => {
    if (saving || optimizing) return;
    if (!reason.trim()) {
      setErrors(prev => ({ ...prev, reason: 'Write why the payment details are being corrected.' }));
      return;
    }
    if (nothingToSave) {
      setFormError('Nothing would change. Enter a different Transaction No. or attach a new proof.');
      return;
    }
    if (isPaid) {
      if (token.current) await submit(token.current);
      else setStepUpOpen(true);
      return;
    }
    const ok = await confirm({
      variant: 'info',
      title: 'Save the correction?',
      message: `This replaces the ${correctedWords([...(refChanged ? ['transactionNumber'] : []), ...(proof ? ['proofOfPayment'] : [])])} on ${runner.orderRef}. The old values stay in the activity trail. Nothing is sent to the runner.`,
      confirmLabel: 'Save correction',
    });
    if (ok) await submit(null);
  };

  const disabled = saving || optimizing || nothingToSave || !reason.trim();
  const hasProof = Boolean(runner.proofOfPayment);

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
              <h3 id={ids.title} className="text-xl font-semibold text-primary m-0">Correct payment</h3>
              <p className="text-sm text-secondary mt-1 m-0 flex flex-wrap items-center gap-x-2 gap-y-1 [overflow-wrap:anywhere]">
                <span>Order {runner.orderRef} &middot; {runner.name}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusPillClass(runner.status)}`}>
                  {runner.status}
                </span>
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

          <div className="admin-modal-body p-6 max-sm:p-4 space-y-6 overflow-y-auto">
            {/* No m-0: it would cancel the space-y gap below this line. */}
            <p className="text-sm text-[var(--ink-85)]">
              Fix a wrong Transaction No. or proof of payment. The amount and the status stay as they are,
              and the old values stay in the activity trail.
            </p>

            {/* Transaction No.: on file, then the field that replaces it. */}
            <section className="space-y-3">
              <h4 className="m-0 text-sm font-semibold text-primary">Transaction No.</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-sunken)] px-4 py-3">
                  <p className="m-0 text-xs text-[var(--text-muted)]">On file now</p>
                  <p className={`m-0 mt-1 font-medium [overflow-wrap:anywhere] ${currentRef ? 'text-primary' : 'text-[var(--text-muted)] italic'}`}>
                    {currentRef || 'None on file'}
                  </p>
                </div>
                <div className="form-group min-w-0 m-0">
                  <label htmlFor={ids.ref} className="form-label">Corrected Transaction No.</label>
                  <input
                    id={ids.ref}
                    className="form-input text-base sm:text-sm"
                    value={reference}
                    maxLength={MAX_REFERENCE}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={e => {
                      setReference(e.target.value);
                      setFormError('');
                    }}
                    disabled={saving}
                  />
                  <p className="m-0 text-xs text-[var(--text-muted)]">
                    {refChanged ? 'Will replace the one on file.' : 'Unchanged. Edit it to correct it.'}
                  </p>
                </div>
              </div>
            </section>

            {/* Proof of payment: the slip on file beside the new one. */}
            <section className="space-y-3">
              <h4 className="m-0 text-sm font-semibold text-primary">Proof of payment</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  {hasProof ? (
                    <ProofPreview
                      label="On file now"
                      src={`/api/admin/proof/${runner.registrationId}`}
                      isPdf={Boolean(runner.proofIsPdf)}
                      onOpen={() => setLightbox(true)}
                    />
                  ) : (
                    <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-sunken)] px-4 py-3">
                      <p className="m-0 text-xs text-[var(--text-muted)]">On file now</p>
                      <p className="m-0 mt-1 text-[var(--text-muted)] italic">No proof on file</p>
                    </div>
                  )}
                </div>
                <div className="form-group min-w-0 m-0">
                  <span className="form-label">Replace with</span>
                  {proof ? (
                    <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-sunken)] overflow-hidden">
                      {proofUrl ? (
                        <img src={proofUrl} alt="The new proof of payment" className="block w-full max-h-[240px] object-contain bg-[var(--dash-sunken)]" />
                      ) : (
                        <span className="flex flex-col items-center gap-2 py-8 text-secondary">
                          <FileText size={28} className="text-accent-blue-ink" aria-hidden="true" />
                          <span className="text-sm font-medium text-primary">PDF receipt</span>
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-[var(--dash-border)]">
                        <span className="text-sm text-primary min-w-0 truncate">{proof.name}</span>
                        <button type="button" className="btn-filter max-lg:min-h-11 shrink-0" onClick={removeFile} disabled={saving}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="file-upload-wrapper" style={{ padding: '1.25rem' }}>
                      <input
                        ref={fileRef}
                        type="file"
                        accept={acceptAttribute('proof')}
                        className="file-upload-input"
                        onChange={e => pickFile(e.target.files?.[0] ?? null)}
                        disabled={saving}
                        aria-label="Upload the corrected proof of payment"
                        aria-invalid={errors.proof ? true : undefined}
                        aria-describedby={errors.proof ? 'correction-proof-error' : undefined}
                      />
                      <div className="file-upload-content">
                        <UploadCloud size={24} className="text-accent-blue-ink" aria-hidden="true" />
                        <div className="text-sm text-primary">Upload the correct proof</div>
                        <div className="text-xs">
                          {describeUploadTypes('proof')}, up to {MAX_UPLOAD_MB} MB. Optional.
                        </div>
                      </div>
                    </div>
                  )}
                  {optimizing && (
                    <p role="status" className="m-0 text-sm text-secondary">
                      <BusyLabel>Optimizing image</BusyLabel>
                    </p>
                  )}
                  <FieldError id="correction-proof-error" message={errors.proof} />
                </div>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="m-0 text-sm text-secondary">Payment method</p>
                <p className="m-0 mt-1 font-medium text-primary">Bank transfer</p>
              </div>
            </div>

            <div className="form-group m-0">
              <label htmlFor={ids.reason} className="form-label">Why is it being corrected?</label>
              <textarea
                id={ids.reason}
                value={reason}
                onChange={e => {
                  setReason(e.target.value);
                  setErrors(prev => ({ ...prev, reason: undefined }));
                }}
                maxLength={CORRECTION_REASON_MAX}
                rows={2}
                placeholder="e.g. Runner sent the correct GCash receipt on Messenger."
                className="w-full bg-[var(--dash-surface)] border border-[var(--dash-border)] rounded-lg px-4 py-3 text-base sm:text-sm text-primary placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--ink-30)] resize-y"
                disabled={saving}
                aria-invalid={errors.reason ? true : undefined}
                aria-describedby={`${ids.reason}-hint${errors.reason ? ' correction-reason-error' : ''}`}
              />
              <p id={`${ids.reason}-hint`} className="text-xs text-[var(--text-muted)] m-0 flex justify-between gap-3">
                <span>Required. Saved in the activity trail with the correction.</span>
                <span className="tabular-nums shrink-0">{reason.length}/{CORRECTION_REASON_MAX}</span>
              </p>
              <FieldError id="correction-reason-error" message={errors.reason} />
            </div>

            {isPaid && (
              <label
                htmlFor={ids.resend}
                className="flex items-start gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--ink-02)] px-4 py-3 cursor-pointer min-h-11"
              >
                <input
                  id={ids.resend}
                  type="checkbox"
                  checked={resend}
                  onChange={e => setResend(e.target.checked)}
                  disabled={saving}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="text-sm">
                  <span className="block text-primary font-medium">Resend the receipt with the corrected reference</span>
                  <span className="block text-xs text-[var(--text-muted)] mt-0.5 [overflow-wrap:anywhere]">
                    {contactEmail ? `Sent to ${contactEmail}.` : 'Sent to the order’s contact email.'} Left off, the runner hears nothing.
                  </span>
                </span>
              </label>
            )}

            {formError && <FieldError id="correction-form-error" message={formError} />}
          </div>

          <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end items-center gap-3 bg-[var(--dash-sunken)] shrink-0">
            <button type="button" onClick={close} disabled={saving} className="btn-cancel bg-transparent border-none cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              className="btn-light"
              onClick={save}
              disabled={disabled}
              title={nothingToSave ? 'Change the Transaction No. or attach a new proof first' : !reason.trim() ? 'Write the reason first' : undefined}
            >
              <ReceiptText size={16} aria-hidden="true" />
              {saving ? <BusyLabel>Saving</BusyLabel> : isPaid ? 'Confirm and save' : 'Save correction'}
            </button>
          </div>
        </div>
      </div>

      {/* Above the panel: same layer, later in the page. */}
      <StepUpDialog
        open={stepUpOpen}
        action="registration.correct-payment"
        targetId={runner.registrationId}
        what="correcting this paid order's payment"
        onConfirmed={stepUpToken => {
          token.current = stepUpToken;
          setStepUpOpen(false);
          void submit(stepUpToken);
        }}
        onCancel={() => setStepUpOpen(false)}
      />

      {lightbox && (
        <ProofLightbox
          registrationId={runner.registrationId}
          orderRef={runner.orderRef}
          transactionNumber={runner.transactionNumber}
          totalAmount={runner.totalAmount}
          status={runner.status}
          isPdf={Boolean(runner.proofIsPdf)}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  );
}

/**
 * The modal's state for the registrants table: which order is open, and the
 * rows it patches after a save.
 */
export function usePaymentCorrection({
  runners,
  onCorrected,
}: {
  runners: RegistrantRow[];
  onCorrected: (registrationId: string, saved: PaymentCorrected) => void;
}) {
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const runner = runnerId ? runners.find(r => r.id === runnerId) ?? null : null;
  const contact = runner
    ? runners.filter(r => r.registrationId === runner.registrationId).sort((a, b) => a.runnerNo - b.runnerNo)[0]
    : null;

  const element = runner ? (
    <PaymentCorrectionModal
      key={runner.registrationId}
      runner={runner}
      contactEmail={contact?.email ?? null}
      onClose={() => setRunnerId(null)}
      onCorrected={onCorrected}
    />
  ) : null;

  return { open: setRunnerId, element };
}
