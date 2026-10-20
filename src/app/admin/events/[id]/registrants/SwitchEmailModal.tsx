"use client";

/**
 * Send by hand, for a delivery switch's email (LOGISTICS_CHANGE_PLAN.md
 * Session 3): where a switch lands when Resend refused its *payment needed* or
 * *switched* email, and where the history's *Send email by hand* opens. The
 * registrants tab's manual-send panel (`ManualEmailModal.tsx`), as
 * `CategoryChangeEmailModal` uses it: the same preview, *Copy formatted email*
 * and *Open in my email app*. Marking it sent stamps the switch's
 * `createdEmailSentAt` or `appliedEmailSentAt` and records who.
 *
 * Mounted when an email is wanted and unmounted after it closes.
 */

import React, { useEffect, useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import ManualEmailModal from './ManualEmailModal';
import { CLIPBOARD_BLOCKED, copyFormattedEmail, openInMailApp, type RenderedEmail } from './email-handoff';
import type { SwitchEmailRequest } from './WaitingSwitchActions';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

export default function SwitchEmailModal({
  request,
  onClose,
  onMarked,
}: {
  request: SwitchEmailRequest;
  onClose: () => void;
  onMarked: () => void;
}) {
  const { alert, toast } = useAlert();
  const [message, setMessage] = useState<RenderedEmail | null>(request.message);
  const [loadError, setLoadError] = useState('');
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'text-only'>('idle');
  const endpoint = `/api/admin/logistics-changes/${request.changeId}/email`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Rendered by the server from the same template it sends, never built here.
  useEffect(() => {
    if (request.message) return;
    let cancelled = false;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ via: 'manual', kind: request.kind }),
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setMessage(data.message);
        else setLoadError(data?.error || 'The email could not be prepared. Try again.');
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not reach the server. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, request.message, request.kind]);

  const leave = () => {
    setVisible(false);
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };

  const copy = async () => {
    if (!message) return;
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ via: 'mark-sent', kind: request.kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'Not Marked As Sent', message: data?.error || 'Try again.' });
        return;
      }
      onMarked();
      toast(`Marked the ${request.changeRef} email as sent.`);
      leave();
    } catch {
      await alert({ variant: 'error', title: 'Not Marked As Sent', message: 'Could not reach the server. Try again.' });
    } finally {
      setMarking(false);
    }
  };

  return (
    <ManualEmailModal
      runner={{ orderRef: request.orderRef, name: `Delivery switch ${request.changeRef}` }}
      orderSize={1}
      message={
        message
          ? {
              ...message,
              outstanding: true,
              label: request.kind === 'created' ? 'Payment Pending' : 'Kits Switched',
              lastEmailError: request.error,
            }
          : null
      }
      isOpen={visible}
      isClosing={closing}
      isLoading={!message && !loadError}
      loadError={loadError}
      isMarkingSent={marking}
      copyState={copyState}
      onClose={() => !marking && leave()}
      onCopy={copy}
      onOpenInMailApp={() => message && openInMailApp(message)}
      onMarkSent={markSent}
      footnote="Send it from your own address, then mark it sent so the receipt's history shows it went out."
    />
  );
}
