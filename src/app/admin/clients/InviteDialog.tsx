"use client";

import React, { useEffect, useId, useRef, useState } from 'react';
import AlertModal from '@/components/ui/AlertModal';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import { readInvitee, type FieldErrors } from '@/lib/team';

/**
 * **Send invite** on a client submission: who should sign in, and at which
 * address.
 *
 * It opens on the contact the application named, because that is almost
 * always the person — but both boxes stay editable, since the one who applied
 * is not always the one who will follow the races, and a second contact is
 * exactly what a resend to an ACTIVE client is for.
 *
 * `AlertModal`'s frame with two real fields in its body, copied from the
 * reject dialog this batch retired. The boxes are checked by `readInvitee` —
 * the rule the invite route runs, which is the team invite's own — as the
 * button is pressed, and the route's refusals land under the same field
 * (an address already on the team, or signing in for another client). The
 * dialog stays open while the request runs and closes only once the
 * invitation is saved; any other refusal is handed back to the page.
 *
 * Mounted per invite, so each starts from the client's own contact.
 */

/** Kept in step with --modal-close-dur in globals.css. */
const CLOSE_MS = 150;

export type InviteResult = { ok: true } | { ok: false; errors?: FieldErrors; error?: string };

export default function InviteDialog({
  clientName,
  resend,
  initialName,
  initialEmail,
  onSubmit,
  onDone,
}: {
  clientName: string;
  /** An invitation is already waiting, so this press replaces its link. */
  resend: boolean;
  initialName: string;
  initialEmail: string;
  /** Sends the invitation. Resolves with what happened; never throws. */
  onSubmit: (invitee: { name: string; email: string }) => Promise<InviteResult>;
  /** Called once the dialog has finished closing, with a refusal to announce if any. */
  onDone: (error?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const emailId = useId();

  // A timer rather than rAF, for AlertProvider's reason: rAF never fires in a
  // tab that is not painting. Focus goes to the first box that needs writing.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpen(true);
      (initialName ? emailRef : nameRef).current?.focus({ preventScroll: true });
    }, 16);
    return () => window.clearTimeout(timer);
  }, [initialName]);

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

  const focusFirst = (found: FieldErrors) => {
    if (found.name) nameRef.current?.focus();
    else if (found.email) emailRef.current?.focus();
  };

  const submit = async () => {
    if (busy) return;
    const read = readInvitee(name, email);
    // The team rule's wording talks about "the person you are inviting",
    // which is exactly right here too.
    setErrors(read.errors);
    if (Object.keys(read.errors).length > 0) {
      focusFirst(read.errors);
      return;
    }
    setBusy(true);
    const result = await onSubmit({ name: read.name, email: read.email });
    setBusy(false);
    if (result.ok) {
      close();
    } else if (result.errors && Object.keys(result.errors).length > 0) {
      setErrors(result.errors);
      focusFirst(result.errors);
    } else {
      close(result.error ?? 'The invitation could not be sent. Please try again.');
    }
  };

  const clear = (field: 'name' | 'email') =>
    setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));

  // Enter in either box sends, as it would in a form.
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <AlertModal
      open={open}
      closing={closing}
      variant="info"
      title={resend ? 'Resend the Invitation' : 'Send an Invitation'}
      showCancel
      busy={busy}
      confirmLabel={
        busy ? <BusyLabel>Sending</BusyLabel> : resend ? 'Resend Invite' : 'Send Invite'
      }
      onConfirm={submit}
      onCancel={() => {
        if (!busy) close();
      }}
      message={
        <div className="flex flex-col gap-4">
          <p className="m-0">
            They get an email with a link to choose a password, then sign in to see{' '}
            <span className="text-white [overflow-wrap:anywhere]">{clientName}</span>&apos;s events
            and how many runners have registered. Nothing else.
            {resend && ' The link sent before stops working.'}
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-sm font-medium text-white">
              Name
            </label>
            <input
              ref={nameRef}
              id={nameId}
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                clear('name');
              }}
              onKeyDown={onEnter}
              autoComplete="off"
              disabled={busy}
              placeholder="Juan Dela Cruz"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              className="form-input text-base"
            />
            <FieldError id={`${nameId}-error`} message={errors.name} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={emailId} className="text-sm font-medium text-white">
              Email Address
            </label>
            <input
              ref={emailRef}
              id={emailId}
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                clear('email');
              }}
              onKeyDown={onEnter}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              placeholder="organizer@example.com"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${emailId}-error` : undefined}
              className="form-input text-base"
            />
            <FieldError id={`${emailId}-error`} message={errors.email} />
          </div>
        </div>
      }
    />
  );
}
