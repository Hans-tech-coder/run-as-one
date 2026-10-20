"use client";

/**
 * What staff can do with a switch still waiting for its fee, in the receipt's
 * *Delivery Payment* modal (LOGISTICS_CHANGE_PLAN.md Session 3, Revision 2), each on
 * the permission it needs, as `AwaitingChangeActions` gates a category change's:
 *
 * **The buttons follow how the fee is paid** (`isOutsidePayment`):
 *
 * - **Both**: *Copy payment link* and *Email payment link*
 *   (`registration:email`). The link is where the runner confirms the address
 *   and receiver and pays (Revision 3): online, or with the GCash or bank
 *   screenshot and reference.
 * - **Online** (PayMongo): no *Record payment*: PayMongo's webhook, or the
 *   runner back from PayMongo, applies it.
 * - **GCash or bank**: *Record payment* (`registration:validate`): the
 *   reference and an optional screenshot, shrunk in the browser
 *   (`compress-proof.ts`). It applies the switch at once. When the runner sent
 *   their proof on the link, *View proof* opens it (`proof:view`), and *Record
 *   payment* starts from their reference and keeps their screenshot unless
 *   staff attach another.
 * - **Cancel switch** (`registration:edit`), after a confirm. The kits stay on
 *   pickup and the payment link stops working.
 *
 * Every success re-reads the page (`onChanged`), since a switch applied moves
 * other receipts' rows too; an email Resend refused opens the by-hand
 * send (`onSendEmail`).
 */

import React, { useState } from 'react';
import { Copy, Image as ImageIcon, Mail, Receipt, XCircle } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import { formatPesos } from '@/lib/money';
import { MAX_TRANSACTION_NUMBER, isOutsidePayment, readTransactionNumber } from '@/lib/category-change-hold';
import { compressProof } from '@/lib/compress-proof';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import { ProofPicker } from './CategoryChangePaymentChoice';
import type { RenderedEmail } from './email-handoff';

/** What this person may do here, decided on the server. */
export type SwitchPermissions = {
  /** `registration:edit`: switch, and cancel a switch. */
  edit: boolean;
  /** `registration:email`: the payment link and the emails. */
  email: boolean;
  /** `registration:validate`: record a payment made outside the app. */
  validate: boolean;
  /** `proof:view`: open a recorded payment's screenshot. */
  proof: boolean;
};

/** An email staff now send by hand: Resend refused it, or they asked. */
export type SwitchEmailRequest = {
  kind: 'created' | 'applied';
  changeId: string;
  changeRef: string;
  orderRef: string;
  message: RenderedEmail | null;
  error: string | null;
};

/** How a switch's email went, as every route that sends one answers. */
export type SwitchEmailAnswer = { sent: true; to: string } | { sent: false; error: string; message: RenderedEmail | null };
type EmailAnswer = SwitchEmailAnswer;

/** The email request a refused send leaves, or null when it went out. */
export function refusedEmail(
  change: LogisticsChangeView,
  orderRef: string,
  kind: SwitchEmailRequest['kind'],
  email: EmailAnswer | null | undefined,
): SwitchEmailRequest | null {
  if (!email || email.sent) return null;
  return { kind, changeId: change.id, changeRef: change.changeRef, orderRef, message: email.message, error: email.error };
}

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

function RecordPayment({
  change,
  onRecorded,
  onClose,
}: {
  change: LogisticsChangeView;
  onRecorded: (data: { change: LogisticsChangeView; email: EmailAnswer | null }) => void;
  onClose: () => void;
}) {
  const { alert } = useAlert();
  // The runner's own reference from the link (Revision 3 T5), for staff to check.
  const [reference, setReference] = useState(change.proofSubmitted ? (change.transactionNumber ?? '') : '');
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ transactionNumber?: string; proofFile?: string }>({});
  const [saving, setSaving] = useState(false);
  const fieldId = `switch-payment-${change.id}`;

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
      const res = await fetch(`/api/admin/logistics-changes/${change.id}/record-payment`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.field === 'transactionNumber' || data?.field === 'proofFile') setErrors({ [data.field]: data.error });
        else await alert({ variant: 'error', title: 'Payment Not Recorded', message: data?.error || 'Try again.' });
        return;
      }
      onRecorded(data);
    } catch {
      await alert({ variant: 'error', title: 'Payment Not Recorded', message: 'Could not reach the server. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--dash-border)] p-3">
      <p className="m-0 text-xs text-secondary">
        Record the {peso(change.fee)} the runner sent by GCash or bank transfer. This switches the receipt to delivery at
        once and emails them.
        {change.proofSubmitted ? ' Their screenshot from the link stays attached; attach another only to replace it.' : ''}
      </p>
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="block text-sm text-secondary">
          GCash or bank reference number
        </label>
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
          {saving ? <BusyLabel>Recording</BusyLabel> : `Record ${peso(change.fee)} and ship`}
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

export default function WaitingSwitchActions({
  change,
  orderRef,
  permissions,
  onChanged,
  onSendEmail,
}: {
  change: LogisticsChangeView;
  orderRef: string;
  permissions: SwitchPermissions;
  /** Something moved: the page's read runs again. */
  onChanged: () => void;
  onSendEmail: (request: SwitchEmailRequest) => void;
}) {
  const { alert, confirm, toast } = useAlert();
  const outside = isOutsidePayment(change.paymentMethod);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<'copy' | 'email' | 'cancel' | null>(null);

  const link = async (via: 'copy' | 'email') => {
    setBusy(via);
    try {
      const res = await fetch(`/api/admin/logistics-changes/${change.id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ via }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'No Payment Link', message: data?.error || 'Try again.' });
        onChanged();
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
      const refused = refusedEmail(change, orderRef, 'created', data.email);
      if (refused) onSendEmail(refused);
      else toast(`Emailed the payment link to ${data.email.to}.`);
      onChanged();
    } catch {
      await alert({ variant: 'error', title: 'No Payment Link', message: 'Could not reach the server. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Cancel this switch?',
      message: `${orderRef} stays on pickup and its payment link stops working.`,
      confirmLabel: 'Cancel switch',
      // "Cancel" beside "Cancel switch" would read as the same thing twice.
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    setBusy('cancel');
    try {
      const res = await fetch(`/api/admin/logistics-changes/${change.id}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'Switch Not Cancelled', message: data?.error || 'Try again.' });
      } else {
        toast(`Cancelled the switch ${change.changeRef}. The kits stay on pickup.`);
      }
      onChanged();
    } catch {
      await alert({ variant: 'error', title: 'Switch Not Cancelled', message: 'Could not reach the server. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  if (recording) {
    return (
      <RecordPayment
        change={change}
        onClose={() => setRecording(false)}
        onRecorded={data => {
          setRecording(false);
          const refused = refusedEmail(data.change, orderRef, 'applied', data.email);
          if (refused) onSendEmail(refused);
          else toast(`Recorded the payment. ${orderRef} now ships${data.email?.sent ? `, and ${data.email.to} was emailed` : ''}.`);
          onChanged();
        }}
      />
    );
  }

  // The table row opens on a click; its buttons must not close it again.
  const press = (action: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    action();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {permissions.proof && change.proofSubmitted && (
        <a
          href={`/api/admin/logistics-changes/${change.id}/proof`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={event => event.stopPropagation()}
          className="btn-filter is-compact gap-1.5 no-underline"
        >
          <ImageIcon size={14} aria-hidden="true" /> View proof
        </a>
      )}
      {permissions.email && (
        <button type="button" onClick={press(() => link('copy'))} disabled={busy !== null} className="btn-filter is-compact gap-1.5">
          <Copy size={14} aria-hidden="true" /> {busy === 'copy' ? <BusyLabel>Copying</BusyLabel> : 'Copy payment link'}
        </button>
      )}
      {permissions.email && (
        <button type="button" onClick={press(() => link('email'))} disabled={busy !== null} className="btn-filter is-compact gap-1.5">
          <Mail size={14} aria-hidden="true" />{' '}
          {busy === 'email' ? <BusyLabel>Sending</BusyLabel> : 'Email payment link'}
        </button>
      )}
      {/* Nothing to record until the runner gives the address and the fee is set (Revision 3b). */}
      {permissions.validate && outside && !change.awaitsAddress && (
        <button type="button" onClick={press(() => setRecording(true))} disabled={busy !== null} className="btn-filter is-compact gap-1.5">
          <Receipt size={14} aria-hidden="true" /> Record payment
        </button>
      )}
      {permissions.edit && (
        <button type="button" onClick={press(cancel)} disabled={busy !== null} className="btn-filter is-compact is-danger gap-1.5">
          <XCircle size={14} aria-hidden="true" /> {busy === 'cancel' ? <BusyLabel>Cancelling</BusyLabel> : 'Cancel switch'}
        </button>
      )}
    </div>
  );
}
