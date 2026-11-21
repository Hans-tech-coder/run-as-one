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
 * - **A paid order needs a fresh confirmation** (C2a) when its Transaction
 *   No. or proof changes (`correctionNeedsStepUp`); a *Paid to* change alone
 *   takes a plain confirm (owner, 2026-11-21). Save opens `StepUpDialog`
 *   first and sends its one-use token. The token is kept for a
 *   retry after a 400 / 409 (the route spends it only when it saves), and
 *   dropped after a 200 or a 403; a 403 opens the dialog again. A pending
 *   order takes a plain confirm.
 * - The runner hears nothing unless the resend tick is on (C6, paid only,
 *   offered with a Transaction No. or proof change: the receipt prints no Paid to).
 * - The amount and the status are never touched (C8).
 *
 * - **Paid to** (PAYMENT_CHANNELS_PLAN.md Batch 3), the account a transfer
 *   went into, is corrected the same way, from one of the race's accounts.
 *   Never cleared back to Untagged.
 *
 * Mounted while an order is picked (`usePaymentCorrection`), so each one
 * starts from its own values.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileText, Maximize2, ReceiptText, ShieldCheck, UploadCloud, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, PDF_TYPE, acceptAttribute, allowedTypes, describeUploadTypes } from '@/lib/uploads';
import { useImageCompression } from '@/lib/image-compress';
import { CORRECTION_REASON_MAX, correctionNeedsStepUp } from '@/lib/payment-correction-rules';
import StepUpDialog from '../../../StepUpDialog';
import ProofLightbox from './ProofLightbox';
import { statusPillClass } from './registrant-display';
import type { RegistrantRow } from './RegistrantsTable';
import type { PaymentCorrected } from './registrant-row-patches';
import { staffError } from './reference-held';
import { PaidToSelect, paidToLabel, usePaidToAccounts } from './paid-to';
import { normalizePaidTo } from '@/lib/payment-channel';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

/** Kept in step with `MAX_TRANSACTION_NUMBER` in lib/category-change-hold.ts. */
const MAX_REFERENCE = 100;

const FIELD_LABELS: Record<string, string> = {
  transactionNumber: 'Transaction No.',
  proofOfPayment: 'proof of payment',
  paidTo: 'account paid to',
};

/** "the Transaction No. and proof of payment", for the toast. */
function correctedWords(fields: string[]): string {
  const words = fields.map(field => FIELD_LABELS[field] ?? field);
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0] ?? 'payment';
}

/** Both proof tiles share one size, so the before and after line up. */
const PROOF_TILE_SIZE = 'h-36 max-sm:h-44';
const PROOF_TILE = `${PROOF_TILE_SIZE} w-full overflow-hidden rounded-lg border border-[var(--dash-border)] bg-[var(--dash-sunken)] flex items-center justify-center`;

/** One correctable field: what is on file beside what replaces it. */
function CorrectionRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="m-0 text-sm font-semibold text-primary">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2 items-start">{children}</div>
    </section>
  );
}

/** The value on file, drawn as a read-only field the same height as the input beside it. */
function OnFile({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  return (
    <div className="form-group min-w-0">
      <span className="form-label">On file now</span>
      <div
        className={`form-input text-base sm:text-sm !bg-[var(--dash-sunken)] [overflow-wrap:anywhere] ${
          empty ? 'italic text-[var(--text-muted)]' : 'font-medium text-primary'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Under a corrected field: whether saving would replace what is on file. */
function ChangeHint({ changed }: { changed: boolean }) {
  return (
    <span className={`block text-xs ${changed ? 'text-accent-blue-ink font-medium' : 'text-[var(--text-muted)]'}`}>
      {changed ? 'Will replace the one on file.' : 'Unchanged.'}
    </span>
  );
}

function PdfMark() {
  return (
    <span className="flex flex-col items-center gap-1.5 text-secondary">
      <FileText size={26} className="text-accent-blue-ink" aria-hidden="true" />
      <span className="text-sm font-medium text-primary">PDF receipt</span>
    </span>
  );
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
  const ids = { title: useId(), ref: useId(), paidTo: useId(), reason: useId(), resend: useId() };
  const isPaid = runner.status === 'PAID';
  const currentRef: string = runner.transactionNumber ?? '';

  const [visible, setVisible] = useState(false);
  const [reference, setReference] = useState(currentRef);
  const accounts = usePaidToAccounts();
  const currentPaidTo: string = runner.paidTo ?? '';
  const [paidTo, setPaidTo] = useState(currentPaidTo);
  const [proof, setProof] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [resend, setResend] = useState(false);
  const [errors, setErrors] = useState<{ proof?: string; reason?: string }>({});
  const [formError, setFormError] = useState<React.ReactNode>('');
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
  const paidToChanged = paidTo !== '' && normalizePaidTo(paidTo) !== normalizePaidTo(currentPaidTo);
  const nothingToSave = !refChanged && !proof && !paidToChanged;
  // C2a: a paid order's Transaction No. or proof needs the step-up; Paid to alone does not.
  const needsStepUp = correctionNeedsStepUp(runner.status, {
    transactionNumber: refChanged ? trimmedRef : null,
    proof: Boolean(proof),
  });
  const changing = [
    ...(refChanged ? ['transactionNumber'] : []),
    ...(proof ? ['proofOfPayment'] : []),
    ...(paidToChanged ? ['paidTo'] : []),
  ];

  const submit = async (stepUpToken: string | null) => {
    setSaving(true);
    setFormError('');
    try {
      const form = new FormData();
      form.set('reason', reason.trim());
      form.set('expectedStatus', runner.status);
      if (refChanged) form.set('transactionNumber', trimmedRef);
      if (proof) form.set('proofFile', proof);
      if (paidToChanged) form.set('paidTo', paidTo);
      if (needsStepUp) {
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
        setFormError(staffError(data, 'The correction could not be saved. Try again.'));
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
      setFormError('Nothing would change. Enter a different Transaction No., attach a new proof or choose another account.');
      return;
    }
    if (needsStepUp) {
      if (token.current) await submit(token.current);
      else setStepUpOpen(true);
      return;
    }
    const ok = await confirm({
      variant: 'info',
      title: 'Save the correction?',
      message: `This replaces the ${correctedWords(changing)} on ${runner.orderRef}. The old values stay in the activity trail. Nothing is sent to the runner.`,
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
          <div className="px-6 py-4 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
            <div className="min-w-0">
              <h3 id={ids.title} className="text-lg font-semibold text-primary m-0">Correct payment</h3>
              <p className="text-sm text-secondary mt-1 m-0 flex flex-wrap items-center gap-x-2 gap-y-1 [overflow-wrap:anywhere]">
                <span>{runner.orderRef} &middot; {runner.name} &middot; Bank transfer</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusPillClass(runner.status)}`}>
                  {runner.status}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="w-11 h-11 -m-2 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
            >
              <X size={20} />
            </button>
          </div>

          <div className="admin-modal-body px-6 py-5 max-sm:p-4 space-y-5 overflow-y-auto">
            {/* No m-0: it would cancel the space-y gap below this line. */}
            <p className="text-sm text-secondary">
              Change only what is wrong. The amount and the status stay as they are, and the old values stay in
              the activity trail.
            </p>

            {/* Transaction No.: on file, then the field that replaces it. */}
            <CorrectionRow title="Transaction No.">
              <OnFile empty={!currentRef}>{currentRef || 'None on file'}</OnFile>
              <div className="form-group min-w-0">
                <label htmlFor={ids.ref} className="form-label">Corrected</label>
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
                <ChangeHint changed={refChanged} />
              </div>
            </CorrectionRow>

            {accounts.length > 0 && (
              <CorrectionRow title="Paid to">
                <OnFile empty={!runner.paidTo}>{paidToLabel(runner.paidTo)}</OnFile>
                <div className="min-w-0">
                  <PaidToSelect
                    id={ids.paidTo}
                    label="Corrected"
                    value={paidTo}
                    onChange={value => {
                      setPaidTo(value);
                      setFormError('');
                    }}
                    hint={<ChangeHint changed={paidToChanged} />}
                  />
                </div>
              </CorrectionRow>
            )}

            {/* Proof of payment: the slip on file beside the new one, two tiles of one size. */}
            <CorrectionRow title="Proof of payment">
              <div className="form-group min-w-0">
                <span className="form-label">On file now</span>
                {hasProof ? (
                  <button
                    type="button"
                    onClick={() => setLightbox(true)}
                    aria-label="Open the proof on file full screen"
                    className={`${PROOF_TILE} group relative cursor-zoom-in p-0 hover:border-[var(--ink-30)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
                  >
                    {runner.proofIsPdf ? (
                      <PdfMark />
                    ) : (
                      <img
                        src={`/api/admin/proof/${runner.registrationId}`}
                        alt="The proof of payment on file"
                        className="max-w-full max-h-full object-contain"
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm font-medium text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                      <Maximize2 size={16} aria-hidden="true" /> View full screen
                    </span>
                  </button>
                ) : (
                  <div className={`${PROOF_TILE} text-sm italic text-[var(--text-muted)]`}>No proof on file</div>
                )}
              </div>
              <div className="form-group min-w-0">
                <span className="form-label">Replace with</span>
                {proof ? (
                  <div className={`${PROOF_TILE} relative`}>
                    {proofUrl ? (
                      <img src={proofUrl} alt="The new proof of payment" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <PdfMark />
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 pl-3 pr-1 bg-[var(--dash-panel-solid)] border-t border-[var(--dash-border)]">
                      <span className="text-xs text-primary min-w-0 truncate">{proof.name}</span>
                      <button
                        type="button"
                        className="shrink-0 min-h-9 max-lg:min-h-11 px-2 text-xs font-medium text-accent-blue-ink hover:underline bg-transparent border-none cursor-pointer"
                        onClick={removeFile}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`file-upload-wrapper ${PROOF_TILE_SIZE}`} style={{ padding: '0.75rem' }}>
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
                      <UploadCloud size={22} className="text-accent-blue-ink" aria-hidden="true" />
                      <div className="text-sm text-primary">Upload the correct proof</div>
                      <div className="text-xs">
                        {describeUploadTypes('proof')}, up to {MAX_UPLOAD_MB} MB
                      </div>
                    </div>
                  </div>
                )}
                {optimizing && (
                  <p role="status" className="m-0 text-xs text-secondary">
                    <BusyLabel>Optimizing image</BusyLabel>
                  </p>
                )}
                <FieldError id="correction-proof-error" message={errors.proof} />
              </div>
            </CorrectionRow>

            <div className="form-group pt-4 border-t border-[var(--dash-border)]">
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
                className="form-input text-base sm:text-sm !min-h-[4.5rem]"
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

            {needsStepUp && (
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
                  <span className="block text-primary font-medium">Resend the receipt with the corrected details</span>
                  <span className="block text-xs text-[var(--text-muted)] mt-0.5 [overflow-wrap:anywhere]">
                    {contactEmail ? `Sent to ${contactEmail}.` : 'Sent to the order’s contact email.'} Left off, the runner hears nothing.
                  </span>
                </span>
              </label>
            )}

            {needsStepUp && (
              <p className="m-0 flex items-start gap-2 text-xs text-secondary">
                <ShieldCheck size={14} className="mt-px shrink-0 text-accent-blue-ink" aria-hidden="true" />
                This order is paid, so changing its Transaction No. or proof asks you to confirm it’s you.
              </p>
            )}

            {formError && <FieldError id="correction-form-error" message={formError} />}
          </div>

          <div className="admin-modal-footer px-6 py-4 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end items-center gap-3 bg-[var(--dash-sunken)] shrink-0">
            <button type="button" onClick={close} disabled={saving} className="btn-cancel bg-transparent border-none cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              className="btn-light"
              onClick={save}
              disabled={disabled}
              title={nothingToSave ? 'Change the Transaction No., the proof or the account first' : !reason.trim() ? 'Write the reason first' : undefined}
            >
              <ReceiptText size={16} aria-hidden="true" />
              {saving ? <BusyLabel>Saving</BusyLabel> : needsStepUp ? 'Confirm and save' : 'Save correction'}
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
