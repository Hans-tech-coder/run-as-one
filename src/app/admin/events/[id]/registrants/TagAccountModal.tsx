"use client";

/**
 * **Tag account** (PAYMENT_CHANNELS_PLAN.md D3): say which account an
 * *Untagged* bank transfer went into, read off its proof. Orders from before
 * checkout asked for it have none, and count as *Untagged* until someone tags
 * them here, one at a time. The screen in front of
 * `POST /api/admin/registrations/[id]/paid-to`.
 *
 * From the row menu, on a bank-transfer order with no account, for a role
 * with `registration:validate`. No reason and no step-up: it moves no money.
 * An order already tagged is changed with *Correct Payment* instead, which the
 * route says if two people tag the same order at once. The proof sits above
 * the picker (for a role that may see it), since it is what the answer is
 * read from.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import ProofPreview from './ProofPreview';
import ProofLightbox from './ProofLightbox';
import type { RegistrantRow } from './RegistrantsTable';
import { PaidToSelect, initialPaidTo, usePaidToAccounts } from './paid-to';
import { staffError } from './reference-held';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

function TagAccountModal({
  runner,
  canViewProof,
  onClose,
  onTagged,
}: {
  runner: RegistrantRow;
  canViewProof: boolean;
  onClose: () => void;
  onTagged: (registrationId: string, paidTo: string) => void;
}) {
  const accounts = usePaidToAccounts();
  const [visible, setVisible] = useState(false);
  const [paidTo, setPaidTo] = useState(() => initialPaidTo(null, accounts));
  const [error, setError] = useState<React.ReactNode>('');
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  // One frame after mount, so the panel's opening transition runs.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = () => {
    if (saving) return;
    setVisible(false);
    setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The lightbox answers its own Escape.
      if (event.key === 'Escape' && !lightbox) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    if (!paidTo) {
      setError('Choose the account the proof shows.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/registrations/${runner.registrationId}/paid-to`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onTagged(runner.registrationId, data.paidTo ?? paidTo);
        setSaving(false);
        setVisible(false);
        setTimeout(onClose, CLOSE_MS);
        return;
      }
      setError(staffError(data, 'The account could not be saved. Try again.'));
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setSaving(false);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 max-sm:items-start bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
          visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onMouseDown={e => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tag-account-title"
          className={`t-modal admin-modal-panel w-full max-w-lg bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-clip ${visible ? 'is-open' : 'is-closing'}`}
        >
          <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
            <div className="min-w-0">
              <h3 id="tag-account-title" className="text-xl font-semibold text-primary m-0">Tag Account</h3>
              <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
                Order {runner.orderRef}
                {runner.transactionNumber ? ` · ref ${runner.transactionNumber}` : ''}
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

          <div className="admin-modal-body p-6 max-sm:p-4 space-y-4 overflow-y-auto">
            <p className="text-sm text-[var(--ink-85)] m-0">
              This order does not say which account the money went into. Read it off the proof and pick it, so the
              race&rsquo;s totals by account include it. Nothing is sent to the runner.
            </p>
            {canViewProof && runner.proofOfPayment && (
              <ProofPreview
                label="Proof of payment"
                src={`/api/admin/proof/${runner.registrationId}`}
                isPdf={Boolean(runner.proofIsPdf)}
                onOpen={() => setLightbox(true)}
              />
            )}
            <PaidToSelect
              id="tag-account-paid-to"
              value={paidTo}
              onChange={value => {
                setPaidTo(value);
                setError('');
              }}
            />
            {error && <FieldError id="tag-account-error" message={error} />}
          </div>

          <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end gap-3 bg-[var(--dash-sunken)] shrink-0">
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="px-4 py-2 min-h-11 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !paidTo}
              className="px-6 py-2 min-h-11 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {saving ? <BusyLabel>Saving</BusyLabel> : 'Save Account'}
            </button>
          </div>
        </div>
      </div>

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

/** Which order is being tagged, for the registrants table. */
export function useTagAccount({
  runners,
  canViewProof,
  onTagged,
}: {
  runners: RegistrantRow[];
  canViewProof: boolean;
  onTagged: (registrationId: string, paidTo: string) => void;
}) {
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const runner = runnerId ? runners.find(r => r.id === runnerId) ?? null : null;

  const element = runner ? (
    <TagAccountModal
      key={runner.registrationId}
      runner={runner}
      canViewProof={canViewProof}
      onClose={() => setRunnerId(null)}
      onTagged={onTagged}
    />
  ) : null;

  return { open: setRunnerId, element };
}
