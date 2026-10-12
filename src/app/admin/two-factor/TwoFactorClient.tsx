"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import AuthHomeLink from '../AuthHomeLink';

/** At or below this many recovery codes left, the page suggests new ones. */
const FEW_CODES_LEFT = 3;

/**
 * The code box of `/admin/two-factor`: six digits from the authenticator app,
 * or — after "Use a recovery code instead" — one of the ten recovery codes.
 *
 * A refusal that ends the pending sign-in (it expired, too many wrong codes,
 * the account was suspended meanwhile) comes back as a `code` from
 * lib/sign-in-errors.ts, and the page goes to the sign-in form, which shows
 * its sentence. A recovery code signs in too, but first says how many are
 * left, so the person learns they are running out while they can still act.
 */
export default function TwoFactorClient() {
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryDone, setRecoveryDone] = useState<{ left: number; next: string } | null>(null);

  const goTo = (path: string) => {
    // As on the sign-in page: drop the layout rendered without a session.
    router.push(path);
    router.refresh();
  };

  const switchMode = () => {
    setUseRecovery(value => !value);
    setCode('');
    setCodeError('');
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const typed = code.replace(/\s/g, '');
    if (!useRecovery && !/^\d{6}$/.test(typed)) {
      setCodeError('Enter the 6-digit code from your authenticator app');
      return;
    }
    if (useRecovery && !typed) {
      setCodeError('Enter one of your recovery codes');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/two-factor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: typed }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (typeof data.code === 'string') {
          goTo(`/admin/login?error=${encodeURIComponent(data.code)}`);
          return;
        }
        if (data.errors?.code) setCodeError(data.errors.code);
        else setFormError(data.error || 'The code could not be checked. Please try again.');
        setIsSubmitting(false);
        return;
      }

      const next = typeof data.next === 'string' ? data.next : '/admin';
      if (typeof data.recoveryCodesLeft === 'number') {
        setRecoveryDone({ left: data.recoveryCodesLeft, next });
        setIsSubmitting(false);
        return;
      }
      goTo(next);
    } catch {
      setFormError('The code could not be checked. Check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  const inputId = 'two-factor-code';
  const errorId = 'two-factor-code-error';
  const fewLeft = recoveryDone !== null && recoveryDone.left <= FEW_CODES_LEFT;

  return (
    <div className="auth-container">
      <div className="auth-bg-shape orange"></div>
      <div className="auth-bg-shape blue"></div>

      <div className="auth-shell">
        <AuthHomeLink />

        <div className="auth-card">
          <div className="auth-header">
            <Link href="/" className="auth-logo-link mb-5" aria-label="Run As One home page">
              <RunAsOneLogo variant="stacked" className="[--rao-logo-size:64px]" decorative />
            </Link>
            <h1 className="auth-title">{recoveryDone ? 'You are signed in' : 'Two-step sign-in'}</h1>
            <p className="auth-subtitle">
              {recoveryDone
                ? 'You used a recovery code. Each one works only once.'
                : useRecovery
                  ? 'Enter one of the recovery codes you saved when you turned on two-step sign-in.'
                  : 'Enter the 6-digit code from your authenticator app.'}
            </p>
          </div>

          {recoveryDone ? (
            <>
              <div className={`auth-message ${fewLeft ? 'auth-error' : 'auth-success'}`} role="status">
                {recoveryDone.left === 0
                  ? 'You have no recovery codes left. Make new ones now in Settings › Security.'
                  : `You have ${recoveryDone.left} recovery ${recoveryDone.left === 1 ? 'code' : 'codes'} left.`}
                {fewLeft && recoveryDone.left > 0
                  ? ' Make new ones in Settings › Security so you are not locked out.'
                  : ''}
              </div>
              <button
                type="button"
                onClick={() => goTo(recoveryDone.next)}
                className="btn-gradient auth-submit text-white font-medium"
              >
                Continue
              </button>
              {fewLeft && (
                <div className="auth-footer">
                  <Link href="/admin/settings/security" className="auth-link">
                    Make new recovery codes
                  </Link>
                </div>
              )}
            </>
          ) : (
            <>
              {formError && (
                <div className="auth-message auth-error" role="alert">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                <div className="form-group">
                  <label className="form-label" htmlFor={inputId}>
                    {useRecovery ? 'Recovery code' : 'Code'}
                  </label>
                  <input
                    key={useRecovery ? 'recovery' : 'totp'}
                    id={inputId}
                    type="text"
                    value={code}
                    onChange={e => {
                      setCode(e.target.value);
                      setCodeError('');
                    }}
                    className="form-input"
                    {...(useRecovery
                      ? { placeholder: 'xxxx-xxxx', autoComplete: 'off', maxLength: 12 }
                      : {
                          placeholder: '123456',
                          inputMode: 'numeric' as const,
                          autoComplete: 'one-time-code',
                          pattern: '[0-9]*',
                          maxLength: 6,
                        })}
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    disabled={isSubmitting}
                    aria-invalid={codeError ? true : undefined}
                    aria-describedby={codeError ? errorId : undefined}
                  />
                  <FieldError id={errorId} message={codeError} />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-gradient auth-submit text-white font-medium"
                >
                  {isSubmitting ? <BusyLabel>Checking</BusyLabel> : 'Sign In'}
                </button>
              </form>

              <div className="auth-footer flex flex-col items-center gap-3">
                <button type="button" onClick={switchMode} className="auth-link" disabled={isSubmitting}>
                  {useRecovery ? 'Use the code from my authenticator app' : 'Use a recovery code instead'}
                </button>
                <Link href="/admin/login" className="auth-link">
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
