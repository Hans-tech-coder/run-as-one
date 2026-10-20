"use client";

/**
 * What staff can do with a switch still waiting for its fee, in the receipt's
 * *Delivery Payment* modal (LOGISTICS_CHANGE_PLAN.md Session 3, Revisions 2
 * and 3), each on the permission it needs, as `AwaitingChangeActions` gates a
 * category change's. Staff already pressed *Send to Runner*; the runner
 * confirms the address and pays on the link in that email, so the modal keeps
 * only what is still left to do:
 *
 * - **Validate Payment** (`registration:validate`, `useValidateSwitch`), once
 *   the runner sent their GCash or bank proof on the link: one press, as a
 *   registrant's bank transfer is validated. It records the runner's own
 *   reference and keeps their screenshot, applies the switch and emails the
 *   runner. The modal's footer and the full-screen proof both offer it. Proof
 *   that came some other way is recorded up front, with *Already paid, record
 *   it now* on *Switch to Delivery*; an online payment applies itself.
 * - **Send email by hand** (`registration:email`), only when Resend refused
 *   the *confirm and pay* email (the daily limit) and nobody marked it sent.
 * - **Cancel switch** (`registration:edit`), after a confirm. The kits stay on
 *   pickup and the link stops working. Once the runner's proof is in, the
 *   confirm says they paid and that cancelling does not refund them.
 *
 * Every success re-reads the page (`onChanged`), since a switch applied moves
 * other receipts' rows too; an email Resend refused opens the by-hand
 * send (`onSendEmail`).
 */

import React, { useState } from 'react';
import { Mail, XCircle } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import { formatPesos } from '@/lib/money';
import type { LogisticsChangeView } from '@/lib/logistics-change-view';
import type { RenderedEmail } from './email-handoff';

/** What this person may do here, decided on the server. */
export type SwitchPermissions = {
  /** `registration:edit`: switch, and cancel a switch. */
  edit: boolean;
  /** `registration:email`: the emails. */
  email: boolean;
  /** `registration:validate`: validate a payment made outside the app. */
  validate: boolean;
  /** `proof:view`: see a payment's screenshot. */
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

/** The email request a refused send leaves, or null when it went out. */
export function refusedEmail(
  change: LogisticsChangeView,
  orderRef: string,
  kind: SwitchEmailRequest['kind'],
  email: SwitchEmailAnswer | null | undefined,
): SwitchEmailRequest | null {
  if (!email || email.sent) return null;
  return { kind, changeId: change.id, changeRef: change.changeRef, orderRef, message: email.message, error: email.error };
}

const peso = (centavos: number) => `₱${formatPesos(centavos)}`;

/** Whether the *confirm and pay* email never reached the runner: Resend refused it and nobody sent it by hand. */
export function createdEmailNotSent(change: LogisticsChangeView): boolean {
  return !change.createdEmailSentAt && !!change.lastEmailError;
}

/**
 * Validate Payment for a switch whose runner sent their proof on the link:
 * the record-payment route with the runner's own reference and no new file,
 * so their screenshot stays the record.
 */
export function useValidateSwitch({
  change,
  orderRef,
  onValidated,
  onSendEmail,
}: {
  change: LogisticsChangeView | null;
  orderRef: string;
  /** The switch applied: the page's read runs again. */
  onValidated: () => void;
  onSendEmail: (request: SwitchEmailRequest) => void;
}) {
  const { alert, toast } = useAlert();
  const [validating, setValidating] = useState(false);

  const validate = async () => {
    if (!change?.transactionNumber) return;
    setValidating(true);
    try {
      const form = new FormData();
      form.set('transactionNumber', change.transactionNumber);
      const res = await fetch(`/api/admin/logistics-changes/${change.id}/record-payment`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'Payment Not Validated', message: data?.error || 'Try again.' });
        return;
      }
      const refused = refusedEmail(data.change, orderRef, 'applied', data.email);
      if (refused) onSendEmail(refused);
      else toast(`Payment validated. ${orderRef} now ships${data.email?.sent ? `, and ${data.email.to} was emailed` : ''}.`);
      onValidated();
    } catch {
      await alert({ variant: 'error', title: 'Payment Not Validated', message: 'Could not reach the server. Try again.' });
    } finally {
      setValidating(false);
    }
  };

  return { validating, validate };
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
  const [cancelling, setCancelling] = useState(false);
  const byHand = permissions.email && createdEmailNotSent(change);

  const cancel = async () => {
    const ok = await confirm({
      variant: 'danger',
      title: 'Cancel this switch?',
      message: change.proofSubmitted
        ? `The runner already sent ${peso(change.totalCharged || change.fee)} by GCash or bank (reference ${change.transactionNumber}). Cancelling keeps ${orderRef} on pickup but does not refund them; refund them yourself.`
        : `${orderRef} stays on pickup and its payment link stops working.`,
      confirmLabel: 'Cancel switch',
      // "Cancel" beside "Cancel switch" would read as the same thing twice.
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    setCancelling(true);
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
      setCancelling(false);
    }
  };

  if (!byHand && !permissions.edit) return null;

  // The table row opens on a click; its buttons must not close it again.
  const press = (action: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    action();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {byHand && (
        <button
          type="button"
          onClick={press(() =>
            onSendEmail({
              kind: 'created',
              changeId: change.id,
              changeRef: change.changeRef,
              orderRef,
              message: null,
              error: change.lastEmailError,
            }),
          )}
          disabled={cancelling}
          className="btn-filter is-compact gap-1.5"
        >
          <Mail size={14} aria-hidden="true" /> Send email by hand
        </button>
      )}
      {permissions.edit && (
        <button type="button" onClick={press(cancel)} disabled={cancelling} className="btn-filter is-compact is-danger gap-1.5">
          <XCircle size={14} aria-hidden="true" /> {cancelling ? <BusyLabel>Cancelling</BusyLabel> : 'Cancel switch'}
        </button>
      )}
    </div>
  );
}
