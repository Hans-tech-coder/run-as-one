"use client";

/**
 * A runner's category changes, in the registrant detail modal
 * (CATEGORY_CHANGE_PLAN.md D1): every move, newest first, with who made it,
 * what the money did, the kit difference, and the two things a change can
 * still be owed — a downgrade's refund, recorded here once it is paid by hand
 * (`registration:validate`), and the applied email, sent by hand here when
 * Resend refused it (`registration:email`). An upgrade still waiting for its
 * payment (Session 3) says what is due, how, and until when its seat is held,
 * with its link, *Record payment* and *Cancel change* (`AwaitingChangeActions`);
 * a paid one says how it was paid, its reference, and opens its screenshot.
 *
 * The order and its receipt are never edited, so this list is the only place
 * on the screen that says a runner's category is not the one they registered
 * in. Each result is handed back through `onUpdated`, so the table's row and
 * this open modal move together.
 */

import React, { useState } from 'react';
import { ArrowRight, ExternalLink, MailWarning } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { formatPesos } from '@/lib/money';
import {
  CATEGORY_CHANGE_STATUSES,
  CATEGORY_CHANGE_STATUS_LABELS,
  CATEGORY_CHANGE_STATUS_TONES,
  asCategoryChangeStatus,
  hasMoved,
} from '@/lib/category-change';
import type { CategoryChangeView } from '@/lib/category-change-view';
import type { RegistrantPermissions } from './RegistrantsTable';
import { changeMoneyLine, kitSummary } from './category-change-display';
import AwaitingChangeActions from './AwaitingChangeActions';
import type { AppliedChange } from './useCategoryChangeModal';
import { formatEventInstant } from '@/lib/event-schedule';
import { isOutsidePayment } from '@/lib/category-change-hold';
import { paymentMethodLabel } from '@/lib/registration-codes';

function RecordRefund({
  change,
  onUpdated,
}: {
  change: CategoryChangeView;
  onUpdated: (change: CategoryChangeView) => void;
}) {
  const { alert, toast } = useAlert();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fieldId = `refund-reference-${change.id}`;

  const save = async () => {
    if (!reference.trim()) {
      setError('Enter the GCash or bank reference of the refund');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/category-changes/${change.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.field === 'reference') setError(data.error);
        else await alert({ variant: 'error', title: 'Refund Not Recorded', message: data?.error || 'Try again.' });
        return;
      }
      onUpdated(data.change);
      toast(`Recorded the ₱${formatPesos(change.refundAmount)} refund.`);
    } catch {
      await alert({ variant: 'error', title: 'Refund Not Recorded', message: 'Could not reach the server. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-filter is-compact w-fit">
        Record refund
      </button>
    );
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-xs text-secondary">
        GCash or bank reference of the ₱{formatPesos(change.refundAmount)} refund
      </label>
      <div className="flex gap-2 max-sm:flex-col">
        <input
          id={fieldId}
          autoComplete="off"
          value={reference}
          onChange={e => {
            setReference(e.target.value);
            setError('');
          }}
          maxLength={100}
          aria-invalid={!!error}
          aria-describedby={`${fieldId}-error`}
          className="form-input flex-1 text-base"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 min-h-11 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] disabled:opacity-50 inline-flex items-center justify-center"
        >
          {saving ? <BusyLabel>Saving</BusyLabel> : 'Save refund'}
        </button>
      </div>
      <FieldError id={`${fieldId}-error`} message={error} />
    </div>
  );
}

export default function CategoryChangeHistory({
  changes,
  permissions,
  onUpdated,
  onSendEmail,
}: {
  changes: CategoryChangeView[];
  permissions: RegistrantPermissions;
  /** With `applied` when the write moved the runner (a payment recorded). */
  onUpdated: (change: CategoryChangeView, applied?: AppliedChange) => void;
  /** Opens the by-hand send for one of a change's emails. */
  onSendEmail: (change: CategoryChangeView, kind: 'applied' | 'created') => void;
}) {
  if (changes.length === 0) return null;
  const newestFirst = [...changes].reverse();

  return (
    <div className="mt-8 pt-8 border-t border-[var(--dash-border)] space-y-4">
      <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">Category Changes</h4>
      <ol className="m-0 p-0 list-none space-y-3">
        {newestFirst.map(change => {
          const status = asCategoryChangeStatus(change.status);
          const kit = { added: change.kitAdded, removed: change.kitRemoved };
          const awaiting = change.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT;
          const emailOwed = hasMoved(change.status) ? !change.appliedEmailSentAt : awaiting && !change.createdEmailSentAt;
          const method = change.paymentMethod
            ? isOutsidePayment(change.paymentMethod)
              ? 'GCash or bank transfer'
              : paymentMethodLabel(change.paymentMethod)
            : null;
          return (
            <li key={change.id} className="rounded-lg border border-[var(--dash-border)] p-3 text-sm space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 font-medium text-primary">
                  {change.fromCategory} <ArrowRight size={14} aria-label="to" /> {change.toCategory}
                </span>
                {status && (
                  <span className={`status-badge ${CATEGORY_CHANGE_STATUS_TONES[status]}`}>
                    {CATEGORY_CHANGE_STATUS_LABELS[status]}
                  </span>
                )}
              </div>
              <p className="m-0 text-secondary">
                {changeMoneyLine(change)}
                <span className="text-[var(--text-muted)]">
                  {' '}&middot; paid for the entry ₱{formatPesos(change.basis)}
                  {change.basisEstimated ? ' (estimated)' : ''}
                  {change.changeFee > 0 ? ` · fee ₱${formatPesos(change.changeFee)}` : ''}
                </span>
              </p>
              {change.basisAdjustReason && (
                <p className="m-0 text-xs text-[var(--text-muted)]">Amount paid adjusted: {change.basisAdjustReason}</p>
              )}
              {(kit.added.length > 0 || kit.removed.length > 0) && (
                <p className="m-0 text-xs text-secondary">Kit: {kitSummary(kit)}</p>
              )}
              {change.reason && <p className="m-0 text-xs text-secondary">Asked: {change.reason}</p>}
              {awaiting && (
                <p className="m-0 text-xs text-secondary">
                  {method ? `To pay by ${method}` : 'To pay'}
                  {change.holdUntil ? ` · seat in ${change.toCategory} held until ${formatEventInstant(change.holdUntil)}` : ''}
                </p>
              )}
              {hasMoved(change.status) && change.totalCharged > 0 && method && (
                <p className="m-0 text-xs text-secondary flex items-center gap-2 flex-wrap">
                  <span>
                    Paid by {method}
                    {change.transactionFee > 0 ? ` (₱${formatPesos(change.transactionFee)} transaction fee)` : ''}
                    {change.transactionNumber ? ` · ref ${change.transactionNumber}` : ''}
                  </span>
                  {change.hasProof && permissions.proof && (
                    <a
                      href={`/api/admin/category-changes/${change.id}/proof`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 min-h-11 text-accent-blue-ink hover:underline"
                    >
                      View screenshot <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </p>
              )}
              <p className="m-0 text-xs text-[var(--text-muted)]">
                {change.changeRef} &middot; by {change.createdBy} &middot; {new Date(change.createdAt).toLocaleString()}
                {change.refundedAt && change.refundedBy
                  ? ` · refund recorded by ${change.refundedBy}, ${new Date(change.refundedAt).toLocaleString()}`
                  : ''}
                {change.cancelledAt && change.cancelledBy
                  ? ` · cancelled by ${change.cancelledBy}, ${new Date(change.cancelledAt).toLocaleString()}`
                  : ''}
                {change.expiredAt ? ` · expired unpaid ${new Date(change.expiredAt).toLocaleString()}` : ''}
              </p>
              {awaiting && (
                <AwaitingChangeActions
                  change={change}
                  permissions={permissions}
                  onUpdated={onUpdated}
                  onRecorded={result => onUpdated(result.change, result)}
                  onSendEmail={onSendEmail}
                />
              )}
              {change.status === CATEGORY_CHANGE_STATUSES.REFUND_DUE && permissions.validate && (
                <RecordRefund change={change} onUpdated={onUpdated} />
              )}
              {emailOwed && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="status-badge danger gap-1" title={change.lastEmailError ?? undefined}>
                    <MailWarning size={12} aria-hidden="true" /> Email unsent
                  </span>
                  {permissions.email && (
                    <button
                      type="button"
                      onClick={() => onSendEmail(change, awaiting ? 'created' : 'applied')}
                      className="btn-filter is-compact"
                    >
                      Send by hand
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
