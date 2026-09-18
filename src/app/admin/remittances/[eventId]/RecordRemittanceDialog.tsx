"use client";

import React, { useEffect, useRef, useState } from 'react';
import { HandCoins, UploadCloud, X } from 'lucide-react';
import AdminSelect from '@/app/admin/AdminSelect';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  acceptAttribute,
  allowedTypes,
  describeUploadTypes,
} from '@/lib/uploads';
import {
  MAX_REMITTANCE_NOTE,
  REMITTANCE_KINDS,
  REMITTANCE_KIND_COPY,
  REMITTANCE_METHODS,
  REMITTANCE_METHOD_LABELS,
  describeRemittance,
  formatSignedPesos,
  parsePesos,
  readRemittance,
  type RemittanceFieldErrors,
} from '@/lib/settlement';

/**
 * **Record Remittance** — one payout to a race's organizer, or money the
 * organizer handed back (ADMIN_MERGE_PLAN.md, Batch 6).
 *
 * The team screen's modal frame (`.admin-modal-panel`: a header, a body that
 * scrolls, a footer that stays in reach), because a new control copies an
 * existing one. The fields are checked by `readRemittance` — the rule the
 * route runs — as Save is pressed, and a route refusal lands under its field.
 *
 * **It says what the entry will leave behind before it is saved**: the balance
 * after it, and a warning line when a payout is larger than what is owed. It
 * does not refuse one: paying an organizer ahead of a validation is a real
 * thing staff do, and the race will simply read Overpaid until it catches up.
 *
 * The receipt is optional and checked for type and size here too, so a phone
 * photo that is too large is refused under the box before it is uploaded.
 */

/** Kept in step with --modal-close-dur in globals.css. */
const CLOSE_MS = 150;

type Errors = RemittanceFieldErrors & { proof?: string };

export default function RecordRemittanceDialog({
  eventId,
  eventTitle,
  balance,
  today,
  onClose,
}: {
  eventId: string;
  eventTitle: string;
  /** The race's balance now, in centavos. */
  balance: number;
  today: string;
  /** Called once closed — with how the saved remittance reads, or null if nothing was saved. */
  onClose: (saved: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<string>('PAYOUT');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<string>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpen(true);
      amountRef.current?.focus({ preventScroll: true });
    }, 16);
    return () => window.clearTimeout(timer);
  }, []);

  const close = (saved: string | null = null) => {
    if (closing) return;
    setOpen(false);
    setClosing(true);
    window.setTimeout(() => onClose(saved), CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const clear = (field: keyof Errors) => setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));

  // What this entry leaves behind, while the amount reads as one.
  const cents = parsePesos(amount);
  const after = cents && cents > 0 ? (kind === 'RETURN' ? balance + cents : balance - cents) : null;

  const pickFile = (file: File | null) => {
    clear('proof');
    if (!file) {
      setProof(null);
      return;
    }
    if (!allowedTypes('proof').includes(file.type)) {
      setErrors(prev => ({ ...prev, proof: `The receipt must be a ${describeUploadTypes('proof')} file.` }));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrors(prev => ({ ...prev, proof: `The receipt must be ${MAX_UPLOAD_MB} MB or smaller.` }));
      return;
    }
    setProof(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');

    const read = readRemittance({ kind, amount, paidOn, method, reference, note }, new Date());
    if (!read.value) {
      setErrors(read.errors);
      if (read.errors.amount) amountRef.current?.focus();
      return;
    }

    const body = new FormData();
    body.set('eventId', eventId);
    body.set('kind', kind);
    body.set('amount', amount);
    body.set('paidOn', paidOn);
    body.set('method', method);
    body.set('reference', reference);
    body.set('note', note);
    if (proof) body.set('proof', proof);

    setBusy(true);
    try {
      const res = await fetch('/api/admin/remittances', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (res.ok) {
        close(describeRemittance(read.value));
        return;
      }
      if (data?.errors && Object.keys(data.errors).length > 0) {
        setErrors(data.errors);
      } else {
        setFormError(data?.error ?? 'The remittance could not be recorded. Please try again.');
      }
    } catch {
      setBusy(false);
      setFormError('Could not reach the server. Check your connection and try again.');
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        open && !closing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onMouseDown={e => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="remittance-form-title"
        className={`t-modal admin-modal-panel w-full max-w-xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${open ? 'is-open' : ''} ${closing ? 'is-closing' : ''}`}
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="remittance-form-title" className="text-xl font-semibold text-white m-0 flex items-center gap-2">
              <HandCoins size={20} className="text-accent-blue shrink-0" aria-hidden="true" />
              Record a Remittance
            </h3>
            <p className="text-sm text-gray-400 mt-1 m-0 truncate">
              {eventTitle} · balance {formatSignedPesos(balance)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && close()}
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center text-gray-400 hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          <div className="form-grid">
            <AdminSelect
              label="Kind"
              listboxLabel="Kind of remittance"
              value={kind}
              options={REMITTANCE_KINDS.map(value => ({
                value,
                label: REMITTANCE_KIND_COPY[value].label,
                hint: REMITTANCE_KIND_COPY[value].hint,
              }))}
              onChange={next => {
                setKind(next);
                clear('kind');
              }}
              error={errors.kind}
            />
            <div className="form-group">
              <label className="form-label" htmlFor="remittance-amount">
                Amount (₱)
              </label>
              <input
                ref={amountRef}
                id="remittance-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="form-input text-base sm:text-sm"
                placeholder="12,500.00"
                value={amount}
                onChange={e => {
                  setAmount(e.target.value);
                  clear('amount');
                }}
                disabled={busy}
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby={errors.amount ? 'remittance-amount-error' : 'remittance-amount-after'}
              />
              <FieldError id="remittance-amount-error" message={errors.amount} />
              {!errors.amount && after !== null && (
                <p
                  id="remittance-amount-after"
                  className={`text-xs mt-2 mb-0 ${after < 0 ? 'text-[#faad14]' : 'text-secondary'}`}
                >
                  {after < 0
                    ? `This is ${formatSignedPesos(-after)} more than the balance, so the event will read Overpaid.`
                    : `Leaves a balance of ${formatSignedPesos(after)}.`}
                </p>
              )}
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="remittance-paid-on">
                Sent On
              </label>
              <input
                id="remittance-paid-on"
                type="date"
                className="form-input text-base sm:text-sm"
                max={today}
                value={paidOn}
                onChange={e => {
                  setPaidOn(e.target.value);
                  clear('paidOn');
                }}
                disabled={busy}
                aria-invalid={errors.paidOn ? true : undefined}
                aria-describedby={errors.paidOn ? 'remittance-paid-on-error' : undefined}
              />
              <FieldError id="remittance-paid-on-error" message={errors.paidOn} />
            </div>
            <AdminSelect
              label="Method"
              listboxLabel="How the money was sent"
              value={method}
              options={REMITTANCE_METHODS.map(value => ({ value, label: REMITTANCE_METHOD_LABELS[value] }))}
              onChange={next => {
                setMethod(next);
                clear('method');
              }}
              error={errors.method}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="remittance-reference">
              Reference Number <span className="text-secondary font-normal">(optional)</span>
            </label>
            <input
              id="remittance-reference"
              type="text"
              autoComplete="off"
              className="form-input text-base sm:text-sm"
              placeholder="As printed on the transfer receipt"
              value={reference}
              onChange={e => {
                setReference(e.target.value);
                clear('reference');
              }}
              disabled={busy}
              aria-invalid={errors.reference ? true : undefined}
              aria-describedby={errors.reference ? 'remittance-reference-error' : undefined}
            />
            <FieldError id="remittance-reference-error" message={errors.reference} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="remittance-note">
              Note <span className="text-secondary font-normal">(optional)</span>
            </label>
            <textarea
              id="remittance-note"
              rows={3}
              maxLength={MAX_REMITTANCE_NOTE}
              className="form-input text-base sm:text-sm"
              placeholder="First half of the settlement, the rest after the race"
              value={note}
              onChange={e => {
                setNote(e.target.value);
                clear('note');
              }}
              disabled={busy}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errors.note ? 'remittance-note-error' : undefined}
            />
            <FieldError id="remittance-note-error" message={errors.note} />
          </div>

          <div className="form-group">
            <span className="form-label">
              Receipt <span className="text-secondary font-normal">(optional)</span>
            </span>
            {proof ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-sm text-white min-w-0 truncate">{proof.name}</span>
                <button
                  type="button"
                  className="btn-filter max-lg:min-h-11"
                  onClick={() => {
                    setProof(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  disabled={busy}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="file-upload-wrapper" style={{ padding: '1.25rem' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={acceptAttribute('proof')}
                  className="file-upload-input"
                  onChange={e => pickFile(e.target.files?.[0] ?? null)}
                  disabled={busy}
                  aria-label="Upload the transfer receipt"
                  aria-invalid={errors.proof ? true : undefined}
                  aria-describedby={errors.proof ? 'remittance-proof-error' : undefined}
                />
                <div className="file-upload-content">
                  <UploadCloud size={24} className="text-accent-blue" aria-hidden="true" />
                  <div className="text-sm text-white">Upload the transfer receipt</div>
                  <div className="text-xs">
                    {describeUploadTypes('proof')}, up to {MAX_UPLOAD_MB} MB
                  </div>
                </div>
              </div>
            )}
            <FieldError id="remittance-proof-error" message={errors.proof} />
          </div>

          {formError && <FieldError id="remittance-form-error" message={formError} />}
        </div>

        <div className="admin-modal-footer p-6 border-t border-white/10 flex justify-end items-center gap-3 bg-black/20 shrink-0">
          <button
            type="button"
            onClick={() => close()}
            disabled={busy}
            className="btn-cancel bg-transparent border-none cursor-pointer"
          >
            Cancel
          </button>
          <button type="submit" className="btn-light" disabled={busy}>
            <HandCoins size={16} aria-hidden="true" />
            {busy ? <BusyLabel>Saving</BusyLabel> : 'Record Remittance'}
          </button>
        </div>
      </form>
    </div>
  );
}
