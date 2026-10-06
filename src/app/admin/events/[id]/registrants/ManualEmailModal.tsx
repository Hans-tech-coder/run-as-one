"use client";

/**
 * Manual Email Modal.
 *
 * The app sends on Resend's free tier: 100 recipients a day, and it stops
 * rather than bills. When a send does not happen the registration is
 * marked (lib/email-delivery.ts) and a person sends the email themselves
 * — this is where they get it.
 *
 * Two ways out, and both are needed:
 *
 *  - *Open in my email app* fills in the recipient and subject through a
 *    mailto:, whose body is plain text by definition. It cannot carry the
 *    design, and a long body can be cut short by the client's own URL
 *    limit. The same constraint rules out a Gmail compose deep link.
 *  - *Copy formatted email* puts the HTML on the clipboard, so pasting
 *    into Gmail's compose window keeps the logo, the gradient bar and the
 *    status pill.
 *
 * The preview is an iframe rather than the markup dropped into this page:
 * the email is a whole document with its own dark palette, and inlining it
 * would leak its styles into the admin and inherit the admin's own.
 *
 * Split out of `RegistrantsTable.tsx` (UNPAID_ORDERS_PLAN.md Batch 2) with its
 * state: `useManualEmailModal` fetches the email and marks it sent, and hands
 * the result back through `onMarkedSent` so the table can update every row on
 * the order.
 *
 * The panel and the two ways out (`email-handoff.ts`) are
 * shared with the Unpaid checkouts tab's Send by hand
 * (`PaymentLinkEmailModal.tsx`, UNPAID_FOLLOWUP_PLAN.md Batch 4), so the
 * payment link email is sent by hand exactly the way a registration email is.
 */

import React, { useState } from 'react';
import { X, Copy, ExternalLink } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import type { RegistrantRow } from './RegistrantsTable';
import { CLIPBOARD_BLOCKED, copyFormattedEmail, openInMailApp } from './email-handoff';

/**
 * The email preview's own small stylesheet, added to the copy shown in the
 * iframe and never to what is copied or sent. A long link in the email is one
 * unbroken word, and inside a phone-width preview it pushed the document wider
 * than its frame.
 */
const EMAIL_PREVIEW_STYLE =
  '<style>body{overflow-wrap:anywhere;word-break:break-word}a{word-break:break-all}img{max-width:100%;height:auto}</style>';

/** Into the head, so the email's doctype still leads and standards mode holds. */
function previewEmailHtml(html: string): string {
  return html.includes('</head>')
    ? html.replace('</head>', `${EMAIL_PREVIEW_STYLE}</head>`)
    : `${html}${EMAIL_PREVIEW_STYLE}`;
}

/** The email route's answer to "mark as sent", as the table copies it onto its rows. */
type MarkedSentRegistration = {
  lastEmailError?: string | null;
  receivedEmailSentAt?: string | null;
  confirmationEmailSentAt?: string | null;
  manualEmailSentAt?: string | null;
  manualEmailSentBy?: string | null;
} | null | undefined;

/**
 * The email belongs to the order, like the remarks do, so the row is only how
 * the staff member reached it.
 */
export function useManualEmailModal({
  runners,
  onMarkedSent,
}: {
  runners: RegistrantRow[];
  onMarkedSent: (registrationId: string, registration: MarkedSentRegistration, outstanding: string | null) => void;
}) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const [emailRunner, setEmailRunner] = useState<any | null>(null);
  const [emailMessage, setEmailMessage] = useState<any | null>(null);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isEmailClosing, setIsEmailClosing] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [emailLoadError, setEmailLoadError] = useState('');
  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'text-only'>('idle');

  /**
   * The manual send.
   *
   * Resend's free tier stops at 100 recipients a day rather than billing, so a
   * registration can be left with no email at all. The row is marked, and this
   * modal hands the staff member the exact message the runner should have had,
   * to send from their own mailbox.
   *
   * The rendering is fetched rather than built here: it comes from the same
   * template the app itself sends (lib/email.ts), so what is pasted into Gmail
   * cannot drift from what Resend would have delivered.
   */
  const openEmailModal = async (runnerId: string) => {
    const runner = runners.find(r => r.id === runnerId);
    if (!runner) return;
    setEmailRunner(runner);
    setEmailMessage(null);
    setEmailLoadError('');
    setCopyState('idle');
    setIsEmailOpen(true);
    setIsLoadingEmail(true);
    try {
      const res = await fetch(`/api/admin/registrations/${runner.registrationId}/email`);
      if (res.ok) {
        setEmailMessage(await res.json());
      } else {
        const { error } = await res.json().catch(() => ({ error: '' }));
        setEmailLoadError(error || 'The email could not be prepared. Please try again.');
      }
    } catch (e) {
      console.error(e);
      setEmailLoadError('Something went wrong while preparing the email. Please try again.');
    } finally {
      setIsLoadingEmail(false);
    }
  };

  const closeEmailModal = () => {
    setIsEmailOpen(false);
    setIsEmailClosing(true);
    setTimeout(() => {
      setIsEmailClosing(false);
      setEmailRunner(null);
      setEmailMessage(null);
      setEmailLoadError('');
      setCopyState('idle');
    }, 150);
  };

  const handleCopyFormattedEmail = async () => {
    if (!emailMessage) return;
    const result = await copyFormattedEmail(emailMessage);
    if (result === 'blocked') {
      alert({ variant: 'error', title: 'Nothing Copied', message: CLIPBOARD_BLOCKED });
      return;
    }
    setCopyState(result);
  };

  const handleOpenInMailApp = () => {
    if (emailMessage) openInMailApp(emailMessage);
  };

  /** Sent by hand, so the order leaves the backlog. */
  const handleMarkEmailSent = async () => {
    if (!emailRunner || !emailMessage) return;
    const registrationId = emailRunner.registrationId;

    setIsMarkingSent(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: emailMessage.kind }),
      });

      if (res.ok) {
        const { registration, outstanding } = await res.json();
        onMarkedSent(registrationId, registration, outstanding);
        closeEmailModal();
      } else {
        const { error } = await res.json().catch(() => ({ error: '' }));
        alert({
          variant: 'error',
          title: 'Not Marked As Sent',
          message: error || 'The registration could not be marked. Please try again.',
        });
      }
    } catch (e) {
      console.error(e);
      alert({
        variant: 'error',
        title: 'Not Marked As Sent',
        message: 'Something went wrong while marking this email as sent. Please try again.',
      });
    } finally {
      setIsMarkingSent(false);
    }
  };

  const orderSize = emailRunner
    ? runners.filter(r => r.registrationId === emailRunner.registrationId).length
    : 0;

  return {
    open: openEmailModal,
    modalProps: {
      runner: emailRunner,
      orderSize,
      message: emailMessage,
      isOpen: isEmailOpen,
      isClosing: isEmailClosing,
      isLoading: isLoadingEmail,
      loadError: emailLoadError,
      isMarkingSent,
      copyState,
      onClose: closeEmailModal,
      onCopy: handleCopyFormattedEmail,
      onOpenInMailApp: handleOpenInMailApp,
      onMarkSent: handleMarkEmailSent,
    },
  };
}

export default function ManualEmailModal({
  runner: emailRunner,
  orderSize,
  message: emailMessage,
  isOpen: isEmailOpen,
  isClosing: isEmailClosing,
  isLoading: isLoadingEmail,
  loadError: emailLoadError,
  isMarkingSent,
  copyState,
  onClose: closeEmailModal,
  onCopy: handleCopyFormattedEmail,
  onOpenInMailApp: handleOpenInMailApp,
  onMarkSent: handleMarkEmailSent,
  footnote = 'Send it from your own address, then mark it below so it leaves the list.',
}: ReturnType<typeof useManualEmailModal>['modalProps'] & {
  /** What marking it sent does, which differs by where the modal is opened. */
  footnote?: string;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 max-sm:p-3 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isEmailOpen && !isEmailClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-modal-title"
        className={`t-modal admin-modal-panel w-full max-w-2xl bg-[var(--dash-panel-solid)] border border-[var(--dash-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isEmailOpen ? 'is-open' : ''} ${isEmailClosing ? 'is-closing' : ''}`}
      >
        <div className="p-6 max-sm:px-4 max-sm:py-3 border-b border-[var(--dash-border)] flex justify-between items-start gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id="email-modal-title" className="text-xl font-semibold text-primary m-0">
              {emailMessage && !emailMessage.outstanding ? 'Email Already Sent' : 'Send This Email By Hand'}
            </h3>
            {emailRunner && (
              <p className="text-sm text-secondary mt-1 m-0 [overflow-wrap:anywhere]">
                Order {emailRunner.orderRef} &middot;{' '}
                {orderSize > 1
                  ? `${orderSize} runners`
                  : emailRunner.name}
                {emailMessage ? ` · ${emailMessage.label}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={closeEmailModal}
            aria-label="Close"
            className="w-11 h-11 -m-3 shrink-0 flex items-center justify-center rounded-full text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal-body p-6 max-sm:p-4 overflow-y-auto flex-1 space-y-4">
          {isLoadingEmail && <p className="text-sm text-secondary m-0">Preparing the email&hellip;</p>}

          {!isLoadingEmail && emailLoadError && (
            <p className="text-sm text-[var(--status-danger)] m-0">{emailLoadError}</p>
          )}

          {!isLoadingEmail && emailMessage && (
            <>
              <div className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 space-y-3 text-sm">
                <span className="flex flex-col">
                  <span className="text-[var(--text-muted)]">To</span>
                  <span className="text-primary font-medium break-all select-all">{emailMessage.to}</span>
                </span>
                <span className="flex flex-col">
                  <span className="text-[var(--text-muted)]">Subject</span>
                  <span className="text-primary font-medium select-all [overflow-wrap:anywhere]">{emailMessage.subject}</span>
                </span>
              </div>

              {/* Resend's own words, so a quota stop is not mistaken for a
                  bad address — the two need opposite responses. */}
              {emailMessage.lastEmailError && (
                <p className="text-xs text-[var(--status-danger)] m-0 [overflow-wrap:anywhere]">
                  Last delivery attempt failed: {emailMessage.lastEmailError}
                </p>
              )}

              {!emailMessage.outstanding && (
                <p className="text-xs text-[var(--text-muted)] m-0">
                  This one already went out
                  {emailMessage.manualEmailSentAt && emailMessage.manualEmailSentBy
                    ? `, sent by hand by ${emailMessage.manualEmailSentBy} on ${new Date(emailMessage.manualEmailSentAt).toLocaleString()}`
                    : ''}
                  . It is here so you can send it again if the runner asks.
                </p>
              )}

              <div className="rounded-lg overflow-hidden border border-[var(--dash-border)] bg-[var(--dash-sunken)]">
                <iframe
                  srcDoc={previewEmailHtml(emailMessage.html)}
                  sandbox=""
                  title="Email preview"
                  className="w-full h-[320px] border-none bg-transparent"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopyFormattedEmail}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--dash-inverse-bg)] text-[var(--dash-inverse-fg)] rounded-lg text-sm font-medium hover:bg-[var(--dash-inverse-hover)] transition-colors border-none cursor-pointer max-sm:flex-1 max-sm:basis-full max-sm:justify-center max-sm:min-h-11"
                >
                  <Copy size={16} />
                  {copyState === 'copied'
                    ? 'Copied — paste into Gmail'
                    : copyState === 'text-only'
                      ? 'Copied as plain text only'
                      : 'Copy Formatted Email'}
                </button>
                <button
                  type="button"
                  onClick={handleOpenInMailApp}
                  className="flex items-center gap-2 px-4 py-2 border border-[var(--dash-border)] text-primary rounded-lg text-sm font-medium hover:bg-[var(--ink-05)] transition-colors bg-transparent cursor-pointer max-sm:flex-1 max-sm:basis-full max-sm:justify-center max-sm:min-h-11"
                >
                  <ExternalLink size={16} /> Open In My Email App
                </button>
              </div>

              <p className="text-xs text-[var(--text-muted)] m-0">
                Copying keeps the design. Your email app opens with the recipient and subject
                filled in but a plain-text body, which a long email can have cut short.{' '}
                {footnote}
              </p>
            </>
          )}
        </div>

        <div className="admin-modal-footer p-6 max-sm:p-4 border-t border-[var(--dash-border)] flex justify-end items-center gap-3 bg-[var(--dash-sunken)] shrink-0">
          <button
            type="button"
            onClick={closeEmailModal}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
          >
            Close
          </button>
          {emailMessage?.outstanding && (
            <button
              type="button"
              onClick={handleMarkEmailSent}
              disabled={isMarkingSent}
              // .btn-light, not the orange gradient: no gradient buttons
              // inside the admin (PROJECT_GUIDE §9).
              className="btn-light"
            >
              {isMarkingSent ? <BusyLabel>Marking</BusyLabel> : 'Mark As Sent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
