"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import PasswordField from './PasswordField';
import { STEP_UP_CHANNEL, isStepUpMessage } from '@/lib/step-up-message';
import type { StepUpAction, StepUpMethod } from '@/lib/step-up';

/**
 * The security check before a dangerous action (lib/step-up.ts,
 * PAYMENT_CORRECTION_PLAN.md C2a). It asks `GET /api/admin/step-up` which
 * proofs this account can give and shows only those: the two-step code when
 * two-step sign-in is on, otherwise the password, with **Confirm with Google**
 * beside it for a staff account linked to Google (a popup through
 * `/api/auth/google/step-up`, answered on lib/step-up-message.ts's channel).
 *
 * A right answer hands the caller a five-minute, one-use token through
 * `onConfirmed`; the caller sends it with the action, whose route spends it
 * with `consumeStepUp`. Nothing here changes the session.
 *
 * Mounted only while open (`open`), on the shared `.admin-modal-panel` frame.
 */
export default function StepUpDialog({
  open,
  action,
  targetId,
  what,
  onConfirmed,
  onCancel,
}: {
  open: boolean;
  action: StepUpAction;
  /** The id the token is bound to (an order id). */
  targetId: string;
  /** What is being confirmed, in a few words: "correcting this paid order's payment". */
  what: string;
  onConfirmed: (token: string) => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <StepUpPanel action={action} targetId={targetId} what={what} onConfirmed={onConfirmed} onCancel={onCancel} />
  );
}

type Methods = StepUpMethod[] | 'loading' | 'failed';

function StepUpPanel({
  action,
  targetId,
  what,
  onConfirmed,
  onCancel,
}: {
  action: StepUpAction;
  targetId: string;
  what: string;
  onConfirmed: (token: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const codeId = useId();
  const [methods, setMethods] = useState<Methods>('loading');
  const [secret, setSecret] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'typed' | 'google' | null>(null);
  const ref = useRef('');
  const popup = useRef<Window | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/admin/step-up', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { methods?: StepUpMethod[] }) => {
        if (live) setMethods(Array.isArray(data.methods) && data.methods.length > 0 ? data.methods : 'failed');
      })
      .catch(() => live && setMethods('failed'));
    return () => {
      live = false;
    };
  }, []);

  const confirmed = useCallback(
    (token: string) => {
      popup.current?.close();
      onConfirmed(token);
    },
    [onConfirmed],
  );

  // The Google popup's answer, on whichever of the two ways reaches us first.
  useEffect(() => {
    const take = (data: unknown) => {
      if (!isStepUpMessage(data) || !ref.current || data.ref !== ref.current) return;
      ref.current = '';
      setBusy(null);
      if (data.ok) confirmed(data.token);
      else setError(data.error);
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(STEP_UP_CHANNEL);
      channel.onmessage = event => take(event.data);
    } catch {
      // No BroadcastChannel: the opener message below still arrives.
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin) take(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => {
      channel?.close();
      window.removeEventListener('message', onMessage);
    };
  }, [confirmed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busy !== 'typed') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const usesCode = Array.isArray(methods) && methods.includes('code');
  const usesGoogle = Array.isArray(methods) && methods.includes('google');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) {
      setFieldError(usesCode ? 'Enter the 6-digit code from your authenticator app' : 'Enter your password');
      return;
    }
    setBusy('typed');
    setError('');
    try {
      const method = usesCode ? 'code' : 'password';
      const res = await fetch('/api/admin/step-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, [method]: secret, action, targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const field = data.errors?.code ?? data.errors?.password;
        if (field) setFieldError(field);
        else setError(data.error || 'Could not confirm. Please try again.');
        setSecret('');
        return;
      }
      confirmed(data.token);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(current => (current === 'typed' ? null : current));
    }
  };

  const withGoogle = () => {
    setError('');
    const id = crypto.randomUUID();
    const params = new URLSearchParams({ action, target: targetId, ref: id });
    const width = 480;
    const height = 640;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const opened = window.open(
      `/api/auth/google/step-up?${params}`,
      'rao-step-up',
      `popup,width=${width},height=${height},left=${left},top=${top}`,
    );
    if (!opened) {
      setError('Your browser blocked the Google window. Allow pop-ups for this site, or confirm with your password.');
      return;
    }
    ref.current = id;
    popup.current = opened;
    setBusy('google');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--dash-scrim)] backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="t-modal is-open admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-[var(--dash-hairline)] rounded-2xl shadow-2xl p-6 flex flex-col gap-5"
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-5 min-h-0">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-500/10 rounded-full text-accent-blue-ink shrink-0 mt-1">
              <ShieldCheck size={24} strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <h3 id={titleId} className="text-xl font-semibold text-primary">Confirm it&apos;s you</h3>
              <p className="text-secondary text-sm leading-relaxed">
                {usesCode
                  ? `Enter the code from your authenticator app before ${what}.`
                  : `Enter your password before ${what}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy === 'typed'}
              aria-label="Close"
              className="-m-3 w-11 h-11 inline-flex items-center justify-center rounded-lg text-secondary hover:text-primary shrink-0"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="admin-modal-body flex flex-col gap-5">

            {methods === 'loading' && <BusyLabel>Checking how you sign in</BusyLabel>}
            {methods === 'failed' && (
              <p className="text-sm text-[var(--status-danger)]" role="alert">
                Could not load this check. Close it and try again.
              </p>
            )}

            {Array.isArray(methods) &&
              (usesCode ? (
                <div className="form-group">
                  <label className="form-label" htmlFor={codeId}>
                    Authenticator Code
                  </label>
                  <input
                    id={codeId}
                    className="form-input two-step-code-input"
                    value={secret}
                    onChange={e => {
                      setSecret(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setFieldError('');
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoCapitalize="off"
                    spellCheck={false}
                    maxLength={6}
                    autoFocus
                    disabled={busy !== null}
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={fieldError ? `${codeId}-error` : undefined}
                  />
                  <FieldError id={`${codeId}-error`} message={fieldError} />
                </div>
              ) : (
                <PasswordField
                  label="Password"
                  value={secret}
                  onChange={value => {
                    setSecret(value);
                    setFieldError('');
                  }}
                  autoComplete="current-password"
                  error={fieldError}
                  disabled={busy !== null}
                />
              ))}

            {error && (
              <p className="text-sm text-[var(--status-danger)]" role="alert">
                {error}
              </p>
            )}

            {usesGoogle && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-secondary">Or sign in to your linked Google account again.</p>
                <button
                  type="button"
                  onClick={withGoogle}
                  disabled={busy !== null}
                  className="btn-light w-full justify-center min-h-11"
                >
                  {busy === 'google' ? (
                    <BusyLabel>Waiting for Google</BusyLabel>
                  ) : (
                    <>
                      <GoogleMark />
                      Confirm with Google
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="admin-modal-footer flex justify-end gap-3 pt-2 border-t border-[var(--dash-hairline)]">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy === 'typed'}
              className="px-4 py-2 min-h-11 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-light min-h-11"
              disabled={busy !== null || !Array.isArray(methods) || !secret}
            >
              {busy === 'typed' ? (
                <BusyLabel>Confirming</BusyLabel>
              ) : (
                <>
                  <ShieldCheck size={16} aria-hidden="true" />
                  Confirm
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Google's full-colour "G", unaltered (as on the sign-in button). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
