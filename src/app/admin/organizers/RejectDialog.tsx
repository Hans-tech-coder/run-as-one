"use client";

import React, { useEffect, useId, useRef, useState } from 'react';
import AlertModal from '@/components/ui/AlertModal';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { MAX_STATUS_NOTE, readStatusNote } from '@/lib/organizer-status';

/**
 * Rejecting an application, with the reason written down.
 *
 * **The applicant reads the reason.** It is quoted in the rejection email the
 * PATCH route sends, which is the owner's decision (one box, and it is sent),
 * so the label says so before a word is typed. A note meant only for the team
 * does not belong here.
 *
 * `AlertModal`'s frame with a real textarea in its body, because a rejection is
 * the one decision on this screen that has to say why: approve and suspend
 * keep the plain `confirm`. The reason is checked by `readStatusNote` — the
 * rule the PATCH route runs — as Reject is pressed, and the
 * route's own refusal lands in the same `FieldError`, so the box and the
 * server can never disagree about what counts as a reason.
 *
 * The dialog stays open while the request runs (`busy`), and closes only when
 * the rejection has been saved. A refusal that is not about the reason (the row
 * moved under somebody else) is handed back to the page to announce.
 *
 * Mounted per rejection, so each one starts with an empty box. Escape cancels
 * unless it is saving; the panel behind it yields the keyboard because this is
 * the topmost `aria-modal`.
 */

/** Kept in step with --modal-close-dur in globals.css. */
const CLOSE_MS = 150;

export type RejectResult = { ok: true } | { ok: false; fieldError?: string; error?: string };

export default function RejectDialog({
  organizerName,
  onSubmit,
  onDone,
}: {
  organizerName: string;
  /** Saves the rejection. Resolves with what happened; never throws. */
  onSubmit: (note: string) => Promise<RejectResult>;
  /** Called once the dialog has finished closing, with the refusal to announce if any. */
  onDone: (error?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const errorId = useId();
  const hintId = useId();

  // A timer rather than rAF, for AlertProvider's reason: rAF never fires in a
  // tab that is not painting. Focus goes to the box, not to the Reject button
  // AlertModal autofocuses — the first thing to do here is write.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpen(true);
      fieldRef.current?.focus({ preventScroll: true });
    }, 16);
    return () => window.clearTimeout(timer);
  }, []);

  const close = (error?: string) => {
    if (closing) return;
    setOpen(false);
    setClosing(true);
    window.setTimeout(() => onDone(error), CLOSE_MS);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Only after the first press: an empty box is not an error until somebody
  // tries to send it. After that it updates as they type, so the red goes the
  // moment the reason is good enough.
  const localError = attempted ? readStatusNote(note).error : undefined;
  const error = localError ?? serverError;

  const submit = async () => {
    if (busy) return;
    setAttempted(true);
    setServerError(undefined);
    const read = readStatusNote(note);
    if (read.error !== undefined) {
      fieldRef.current?.focus();
      return;
    }
    setBusy(true);
    const result = await onSubmit(read.note);
    setBusy(false);
    if (result.ok) {
      close();
    } else if (result.fieldError) {
      setServerError(result.fieldError);
      fieldRef.current?.focus();
    } else {
      close(result.error ?? 'The application could not be rejected. Please try again.');
    }
  };

  return (
    <AlertModal
      open={open}
      closing={closing}
      variant="danger"
      title="Reject This Application"
      showCancel
      busy={busy}
      confirmLabel={busy ? <BusyLabel>Rejecting</BusyLabel> : 'Reject Application'}
      onConfirm={submit}
      onCancel={() => {
        if (!busy) close();
      }}
      message={
        <div className="flex flex-col gap-4">
          <p className="m-0">
            <span className="text-white [overflow-wrap:anywhere]">{organizerName}</span> will not
            be able to sign in, and the applicant is emailed the reason below. You can still
            approve it later.
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor={fieldId} className="text-sm font-medium text-white">
              Why — the applicant will read this
            </label>
            <textarea
              ref={fieldRef}
              id={fieldId}
              value={note}
              onChange={e => {
                setNote(e.target.value);
                setServerError(undefined);
              }}
              rows={4}
              maxLength={MAX_STATUS_NOTE}
              disabled={busy}
              placeholder="e.g. We could not verify your organization — the website and page you gave do not load."
              aria-invalid={error ? true : undefined}
              aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
              className="form-input text-sm"
            />
            <FieldError id={errorId} message={error} />
            <p id={hintId} className="m-0 text-xs text-gray-500">
              Quoted in the email to the applicant, and kept with the decision.{' '}
              <span className="whitespace-nowrap">
                {note.trim().length}/{MAX_STATUS_NOTE.toLocaleString('en-PH')}
              </span>
            </p>
          </div>
        </div>
      }
    />
  );
}
