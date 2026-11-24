'use client';

/**
 * Paying a GCash or bank delivery switch on its link (LOGISTICS_CHANGE_PLAN.md
 * Revision 3 T5, T7): the event's accounts, each opening its number and QR
 * (`BankDetailsModal`, the wizard's), then the payment's screenshot and its
 * reference, posted to `api/logistics-change/proof`. With more than one
 * account the runner also says which one they paid into (`PaidToPicker`,
 * PAYMENT_CHANNELS_PLAN.md D2), sent as `paidTo`. The upload box and the
 * reference field are the bank-transfer wizard's, at this page's size; the
 * screenshot is shrunk in the browser first (`image-compress.ts`), as staff's
 * *Record payment* does.
 *
 * Once a proof is in, the page shows it as submitted (`SwitchConfirm`), and
 * this form comes back only on *Replace proof*.
 *
 * A GCash or bank category change's link (`/pay/change/[token]`) uses the same
 * form, posting to `api/category-change/proof` through `endpoint`.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileImage, FileText, Landmark, UploadCloud, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import type { BankAccountView } from '@/lib/bank-accounts';
import { compressImage } from '@/lib/image-compress';
import { MAX_UPLOAD_MB, PDF_TYPE, acceptAttribute, describeUploadTypes } from '@/lib/uploads';
import { MAX_TRANSACTION_NUMBER, readTransactionNumber } from '@/lib/category-change-hold';
import BankDetailsModal from '@/app/events/[slug]/register/BankDetailsModal';
import PaidToPicker, { paidToFor, paidToMissing } from '@/app/events/[slug]/register/PaidToPicker';
import { PAID_TO_REQUIRED } from '@/lib/manual-checkout-form';

type Errors = { proofFile?: string; transactionNumber?: string; paidTo?: string; form?: string };

export default function SwitchBankProof({
  token,
  amount,
  bankAccounts,
  replacing,
  onCancel,
  endpoint = '/api/logistics-change/proof',
}: {
  token: string;
  /** Where the proof is posted: a switch's route, or a category change's. */
  endpoint?: string;
  /** "₱150.00", the exact figure to send. */
  amount: string;
  bankAccounts: BankAccountView[];
  /** A proof is already in; this one replaces it. */
  replacing: boolean;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [bank, setBank] = useState<BankAccountView | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [pickedPaidTo, setPickedPaidTo] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const checked = readTransactionNumber(reference);
    const next: Errors = {
      ...(file ? {} : { proofFile: 'Add the screenshot of your payment.' }),
      ...(checked.error ? { transactionNumber: checked.error } : {}),
      ...(paidToMissing(bankAccounts, pickedPaidTo) ? { paidTo: PAID_TO_REQUIRED } : {}),
    };
    setErrors(next);
    if (next.proofFile || next.transactionNumber || next.paidTo || !file) return;

    setBusy(true);
    try {
      const form = new FormData();
      form.set('token', token);
      form.set('transactionNumber', reference);
      form.set('paidTo', paidToFor(bankAccounts, pickedPaidTo));
      form.set('proofFile', await compressImage(file, 'proof'));
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.field === 'proofFile' || data?.field === 'transactionNumber' || data?.field === 'paidTo') setErrors({ [data.field]: data.error });
        else setErrors({ form: data?.error || 'Your proof could not be sent. Try again.' });
        return;
      }
      onCancel?.();
      router.refresh();
    } catch {
      setErrors({ form: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (bankAccounts.length === 0) {
    return (
      <p role="alert" className="m-0 rounded-panel border border-accent-orange/30 bg-accent-orange/10 p-4 text-sm text-site-ink">
        The accounts to pay into are not ready yet. Reply to our email and we will send you where to pay.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-panel border border-accent-blue/20 bg-accent-blue/5 p-4">
        <Landmark size={20} className="mt-0.5 shrink-0 text-accent-blue" aria-hidden="true" />
        <p className="m-0 text-sm leading-relaxed text-site-muted">
          Send exactly <strong className="text-site-ink">{amount}</strong> by GCash or bank transfer to one of these
          accounts, then upload the screenshot of your payment and its reference number.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {bankAccounts.map(account => (
          <button
            key={account.id}
            type="button"
            onClick={() => setBank(account)}
            className="min-h-[44px] rounded-control border border-site-line bg-site-card p-4 text-center transition-colors hover:border-accent-blue hover:bg-site-surface"
          >
            <span className="block text-lg font-bold text-site-ink">{account.bankName}</span>
            <span className="block text-sm text-site-muted">
              {account.qrImageUrl ? 'Tap for the number and QR' : 'Tap for the account number'}
            </span>
          </button>
        ))}
      </div>

      <div>
        {!file ? (
          <div className="relative rounded-panel border-2 border-dashed border-[var(--site-line-strong)] bg-site-card p-6 text-center transition-colors hover:border-site-ink hover:bg-site-surface">
            <input
              id="switch-proof"
              type="file"
              accept={acceptAttribute('proof')}
              onChange={e => {
                setFile(e.target.files?.[0] ?? null);
                setErrors({});
              }}
              aria-label="Screenshot of your payment"
              aria-invalid={!!errors.proofFile}
              aria-describedby="switch-proof-error"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
            <UploadCloud size={30} className="mx-auto mb-2 text-accent-blue" aria-hidden="true" />
            <p className="m-0 font-bold text-site-ink">Upload the Screenshot of Your Payment</p>
            <p className="m-0 mt-1 text-xs text-site-muted">
              {describeUploadTypes('proof')} (max {MAX_UPLOAD_MB}MB)
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-panel border border-site-line bg-site-surface p-4">
            <div className="flex min-w-0 items-center gap-3">
              {file.type === PDF_TYPE ? (
                <FileText size={22} className="shrink-0 text-accent-blue" aria-hidden="true" />
              ) : (
                <FileImage size={22} className="shrink-0 text-accent-blue" aria-hidden="true" />
              )}
              <span className="min-w-0 break-words text-sm font-semibold text-site-ink">{file.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Remove the screenshot"
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-control text-site-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        )}
        <FieldError id="switch-proof-error" message={errors.proofFile} />
      </div>

      <PaidToPicker
        id="switch-paid-to"
        accounts={bankAccounts}
        value={pickedPaidTo}
        onChange={bankName => {
          setPickedPaidTo(bankName);
          setErrors({});
        }}
        error={errors.paidTo}
      />

      <div className="input-group full-width">
        <label htmlFor="switch-reference">
          Reference Number <span className="text-red-500">*</span>
        </label>
        <input
          id="switch-reference"
          autoComplete="off"
          value={reference}
          maxLength={MAX_TRANSACTION_NUMBER}
          onChange={e => {
            setReference(e.target.value);
            setErrors({});
          }}
          placeholder="From your GCash or bank receipt"
          aria-invalid={!!errors.transactionNumber}
          aria-describedby="switch-reference-error"
        />
        <FieldError id="switch-reference-error" message={errors.transactionNumber} />
      </div>

      {errors.form && (
        <p role="alert" className="m-0 text-center text-sm font-medium text-red-400">
          {errors.form}
        </p>
      )}

      <div className="flex flex-col items-stretch gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="btn-gradient justify-center rounded-control px-8 py-4 text-base disabled:opacity-60"
        >
          {busy ? <BusyLabel>Sending</BusyLabel> : replacing ? 'Replace My Proof' : 'Submit My Proof'}
        </button>
        {replacing && onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary justify-center">
            Keep the Proof I Sent
          </button>
        )}
      </div>

      {bank && <BankDetailsModal bank={bank} onClose={() => setBank(null)} />}
    </div>
  );
}
