"use client";

/**
 * How an upgrade is paid, in Change category (CATEGORY_CHANGE_PLAN.md Session
 * 3): the ways in `category-change-hold.ts` that match how the entry was paid
 * (`paymentChoicesForOrder` — online stays online, bank stays bank), as the
 * modal's radio tiles; a single way is shown already chosen,
 * each saying in words what it does to the fee and how long the new seat is
 * held — and, for a payment already made by GCash or bank, the reference number
 * and the optional screenshot that record it in the same step.
 *
 * Both money fields are `autoComplete="off"`: a browser's remembered reference
 * here would quietly record the wrong payment.
 */

import React from 'react';
import { Link2, Landmark, CircleCheck, UploadCloud, Trash } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import { formatPesos } from '@/lib/money';
import { acceptAttribute, describeUploadTypes } from '@/lib/uploads';
import {
  CHANGE_PAYMENT_CHOICES,
  ONLINE_CHANGE_HOLD_HOURS,
  OUTSIDE_CHANGE_HOLD_DAYS,
  MAX_TRANSACTION_NUMBER,
  type ChangePaymentChoice,
} from '@/lib/category-change-hold';
import { paymentMethodLabel } from '@/lib/registration-codes';

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

export default function CategoryChangePaymentChoice({
  amount,
  onlineFee,
  onlineMethod,
  allowed,
  orderMethod,
  choice,
  setChoice,
  transactionNumber,
  setTransactionNumber,
  proofFile,
  setProofFile,
  errors,
}: {
  amount: number;
  /** The transaction fee an online payment adds (D13). */
  onlineFee: number;
  onlineMethod: string | null;
  /** The choices this order may use (`paymentChoicesForOrder`). */
  allowed: ChangePaymentChoice[];
  /** How the entry itself was paid, for the line under the heading. */
  orderMethod: string | null;
  choice: ChangePaymentChoice | null;
  setChoice: (choice: ChangePaymentChoice) => void;
  transactionNumber: string;
  setTransactionNumber: (value: string) => void;
  proofFile: File | null;
  setProofFile: (file: File | null) => void;
  errors: { choice?: string; transactionNumber?: string; proofFile?: string };
}) {
  const all: { value: ChangePaymentChoice; icon: React.ReactNode; title: string; hint: string }[] = [
    {
      value: CHANGE_PAYMENT_CHOICES.ONLINE,
      icon: <Link2 size={16} aria-hidden="true" />,
      title: 'Send a payment link',
      hint: `Runner pays ${peso(amount + onlineFee)} online by ${paymentMethodLabel(onlineMethod)}, ${peso(onlineFee)} transaction fee included. Seat held ${ONLINE_CHANGE_HOLD_HOURS} hours.`,
    },
    {
      value: CHANGE_PAYMENT_CHOICES.OUTSIDE_LATER,
      icon: <Landmark size={16} aria-hidden="true" />,
      title: 'Will pay by GCash or bank',
      hint: `Runner sends ${peso(amount)}, no fee. Seat held ${OUTSIDE_CHANGE_HOLD_DAYS} days; record the payment once it lands.`,
    },
    {
      value: CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID,
      icon: <CircleCheck size={16} aria-hidden="true" />,
      title: 'Already paid by GCash or bank',
      hint: `Record the ${peso(amount)} now and move the runner at once.`,
    },
  ];
  const options = all.filter(option => allowed.includes(option.value));
  const methodLabel = paymentMethodLabel(orderMethod);

  return (
    <div className="space-y-3">
      <fieldset className="p-0 border-none mx-0" aria-describedby="category-change-payment-error">
        <legend className="block text-secondary mb-1 p-0">How does the runner pay?</legend>
        {methodLabel && (
          <p className="m-0 mb-2 text-xs text-[var(--text-muted)]">
            Paid the registration {methodLabel === 'Online' ? 'online' : `by ${methodLabel}`}, so the difference is paid
            the same way.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2">
          {options.map(option => {
            const selected = choice === option.value;
            return (
              <label
                key={option.value}
                className={`flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ink-30)] ${
                  selected
                      ? 'cursor-pointer border-accent-blue bg-accent-blue/10'
                      : 'cursor-pointer border-[var(--dash-border)] bg-[var(--ink-02)] hover:border-[var(--ink-20)]'
                }`}
              >
                <input
                  type="radio"
                  name="category-change-payment"
                  value={option.value}
                  checked={selected}
                  onChange={() => setChoice(option.value)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                    selected ? 'border-accent-blue bg-accent-blue shadow-[inset_0_0_0_2px_var(--dash-panel-solid)]' : 'border-[var(--ink-30)]'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className={`flex items-center gap-1.5 text-primary ${selected ? 'font-semibold' : 'font-medium'}`}>
                    {option.icon} {option.title}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        <FieldError id="category-change-payment-error" message={errors.choice} />
      </fieldset>

      {choice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID && (
        <div className="space-y-3 rounded-lg border border-[var(--dash-border)] p-3">
          <div className="space-y-1.5">
            <label htmlFor="category-change-transaction" className="block text-secondary">
              GCash or bank reference number
            </label>
            <input
              id="category-change-transaction"
              autoComplete="off"
              value={transactionNumber}
              onChange={e => setTransactionNumber(e.target.value)}
              maxLength={MAX_TRANSACTION_NUMBER}
              placeholder="e.g. 7012 345 678901"
              aria-invalid={!!errors.transactionNumber}
              aria-describedby="category-change-transaction-error"
              className="form-input w-full text-base"
            />
            <FieldError id="category-change-transaction-error" message={errors.transactionNumber} />
          </div>
          <ProofPicker id="category-change-proof" file={proofFile} onChange={setProofFile} error={errors.proofFile} />
        </div>
      )}
    </div>
  );
}

/**
 * The optional screenshot of a GCash or bank payment, in the event form's
 * upload control (`.file-upload-wrapper`, as `BankAccountsPanel`'s QR) rather
 * than the browser's own picker. Holds the file only; it is shrunk and sent
 * with the record (`image-compress.ts`). Shared with the history's *Record
 * payment*.
 */
export function ProofPicker({
  id,
  file,
  onChange,
  error,
}: {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-secondary">
        Screenshot of the payment <span className="text-[var(--text-muted)]">(optional)</span>
      </label>
      {!file ? (
        <div className="file-upload-wrapper">
          <input
            id={id}
            type="file"
            accept={acceptAttribute('proof')}
            onChange={e => onChange(e.target.files?.[0] ?? null)}
            aria-invalid={!!error}
            aria-describedby={`${id}-error`}
            className="file-upload-input"
          />
          <div className="file-upload-content">
            <div className="file-upload-icon">
              <UploadCloud size={28} aria-hidden="true" />
            </div>
            <div className="file-upload-title">Click to attach the screenshot</div>
            <div className="file-upload-desc">{describeUploadTypes('proof')} · made smaller before it is saved</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--ink-02)] px-3 py-2">
          <span className="min-w-0 text-sm text-primary [overflow-wrap:anywhere]">{file.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-11 shrink-0 inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary bg-transparent border-none cursor-pointer p-0"
          >
            <Trash size={14} aria-hidden="true" /> Remove
          </button>
        </div>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
