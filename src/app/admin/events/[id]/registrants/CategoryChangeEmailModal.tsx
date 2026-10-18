"use client";

/**
 * Send by hand, for a category change's applied email (CATEGORY_CHANGE_PLAN.md):
 * where a change lands when Resend refused its email, and where the history's
 * *Send by hand* opens. The registrants tab's manual-send panel
 * (`ManualEmailModal.tsx`), not a second one, as the payment link's is
 * (`PaymentLinkEmailModal.tsx`): the same preview, *Copy formatted email* and
 * *Open in my email app*. Marking it sent stamps the change's
 * `appliedEmailSentAt` and records who.
 *
 * Either of a change's two emails (`kind`): the applied one, or the created
 * one — an upgrade's payment link and breakdown (Session 3), whose marking
 * stamps `createdEmailSentAt`.
 *
 * Mounted when a change's email is wanted and unmounted after it closes.
 */

import React, { useEffect, useState } from 'react';
import { useAlert } from '@/components/ui/AlertProvider';
import type { CategoryChangeView } from '@/lib/category-change-view';
import ManualEmailModal from './ManualEmailModal';
import { CLIPBOARD_BLOCKED, copyFormattedEmail, openInMailApp, type RenderedEmail } from './email-handoff';

/** Kept in step with the panel's closing transition (`.t-modal`). */
const CLOSE_MS = 150;

export type ChangeEmailRequest = {
  /** Which email: the move done, or an upgrade's payment link. */
  kind: 'applied' | 'created';
  runnerId: string;
  changeId: string;
  changeRef: string;
  runnerName: string;
  /** Already rendered when the route handed it back after a refused send. */
  message: RenderedEmail | null;
  /** Resend's reason, when there was a refused send. */
  error: string | null;
};

export default function CategoryChangeEmailModal({
  request,
  onClose,
  onMarked,
}: {
  request: ChangeEmailRequest;
  onClose: () => void;
  onMarked: (runnerId: string, change: CategoryChangeView) => void;
}) {
  const { alert, toast } = useAlert();
  const [message, setMessage] = useState<RenderedEmail | null>(request.message);
  const [loadError, setLoadError] = useState('');
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'text-only'>('idle');

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Rendered by the server from the same template it sends, never built here.
  useEffect(() => {
    if (request.message) return;
    let cancelled = false;
    fetch(`/api/admin/category-changes/${request.changeId}/email`, {
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
  }, [request.changeId, request.message, request.kind]);

  const close = () => {
    if (marking) return;
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
      const res = await fetch(`/api/admin/category-changes/${request.changeId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ via: 'mark-sent', kind: request.kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alert({ variant: 'error', title: 'Not Marked As Sent', message: data?.error || 'Try again.' });
        return;
      }
      onMarked(request.runnerId, data.change);
      toast(`Marked the ${request.changeRef} email as sent.`);
      setVisible(false);
      setClosing(true);
      setTimeout(onClose, CLOSE_MS);
    } catch {
      await alert({ variant: 'error', title: 'Not Marked As Sent', message: 'Could not reach the server. Try again.' });
    } finally {
      setMarking(false);
    }
  };

  return (
    <ManualEmailModal
      runner={{ orderRef: request.changeRef, name: request.runnerName }}
      orderSize={1}
      message={message ? { ...message, outstanding: true, label: request.kind === 'created' ? 'Payment Pending' : 'Category Changed', lastEmailError: request.error } : null}
      isOpen={visible}
      isClosing={closing}
      isLoading={!message && !loadError}
      loadError={loadError}
      isMarkingSent={marking}
      copyState={copyState}
      onClose={close}
      onCopy={copy}
      onOpenInMailApp={() => message && openInMailApp(message)}
      onMarkSent={markSent}
      footnote="Send it from your own address, then mark it sent so the runner's history shows it went out."
    />
  );
}
