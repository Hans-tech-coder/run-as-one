"use client";

/**
 * Send by hand, for the payment link (UNPAID_FOLLOWUP_PLAN.md Batch 4): the
 * payment link email, rendered by the server with a live link in it, for a
 * staff member to send from their own mailbox. It spends none of Resend's 100
 * a day (decision D7), and it is where Send payment link lands when Resend
 * refuses the send, with Resend's reason shown, the way a registration email
 * that failed is sent by hand.
 *
 * **The registrants tab's manual-send panel, not a second one**
 * (`ManualEmailModal.tsx`): the same preview, *Copy formatted email* and
 * *Open in my email app*, so the two read and behave alike. Only "Mark as
 * sent" differs: here it logs the follow-up "Link sent", which is what the
 * Follow-up column shows, rather than stamping an email the order was owed.
 *
 * Mounted when an email is ready and unmounted after it closes, so each order
 * starts clean (the list keys it by order id).
 */

import React, { useEffect, useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import ManualEmailModal from './ManualEmailModal';
import { CLIPBOARD_BLOCKED, copyFormattedEmail, openInMailApp, type RenderedEmail } from './email-handoff';
import type { UnpaidCheckout } from './UnpaidCheckoutsList';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

/** What the payment-link route hands back for a by-hand send. */
export type PreparedLinkEmail = {
  order: UnpaidCheckout;
  message: RenderedEmail;
  /** Resend's reason, when this is the fallback for a send it refused. */
  error: string | null;
  untilLabel: string;
};

export default function PaymentLinkEmailModal({
  prepared,
  onClose,
  onMarked,
}: {
  prepared: PreparedLinkEmail;
  onClose: () => void;
  onMarked: () => void;
}) {
  const { alert, toast } = useAlert();
  const { order, message, error, untilLabel } = prepared;
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'text-only'>('idle');

  // One frame after mount, so the panel's opening transition runs.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = () => {
    if (marking) return;
    setVisible(false);
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };

  const copy = async () => {
    const result = await copyFormattedEmail(message);
    if (result === 'blocked') {
      await alert({ variant: 'error', title: 'Nothing Copied', message: CLIPBOARD_BLOCKED });
      return;
    }
    setCopyState(result);
  };

  const markSent = async () => {
    setMarking(true);
    try {
      const res = await fetch(`/api/admin/registrations/${order.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'LINK_SENT' }),
      });
      if (!res.ok) {
        const { error: reason } = await res.json().catch(() => ({ error: '' }));
        await alert({
          variant: 'error',
          title: 'Not Marked As Sent',
          message: reason || 'The follow-up could not be saved. Try again.',
        });
        return;
      }
      toast(`Marked the payment link for ${order.orderRef} as sent.`);
      onMarked();
      setVisible(false);
      setClosing(true);
      setTimeout(onClose, CLOSE_MS);
    } catch {
      await alert({
        variant: 'error',
        title: 'Not Marked As Sent',
        message: 'Something went wrong while marking the link sent. Try again.',
      });
    } finally {
      setMarking(false);
    }
  };

  return (
    <ManualEmailModal
      runner={{ orderRef: order.orderRef, name: order.contactName }}
      orderSize={order.runnerNames.length}
      message={{ ...message, outstanding: true, label: 'Payment Link', lastEmailError: error }}
      isOpen={visible}
      isClosing={closing}
      isLoading={false}
      loadError=""
      isMarkingSent={marking}
      copyState={copyState}
      onClose={close}
      onCopy={copy}
      onOpenInMailApp={() => openInMailApp(message)}
      onMarkSent={markSent}
      footnote={`The link in it works until ${untilLabel}. Send it from your own address, then mark it sent so the Follow-up column shows it.`}
    />
  );
}
