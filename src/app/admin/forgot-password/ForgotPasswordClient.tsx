"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import BusyLabel from '@/components/ui/BusyLabel';
import FieldError from '@/components/ui/FieldError';
import AuthHomeLink from '../AuthHomeLink';

/**
 * The form half of `/admin/forgot-password`: an email box, then the same
 * "check your email" whatever the address was. The route answers every address
 * alike, so this page cannot say more than that, and it does not try to.
 */
export default function ForgotPasswordClient() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [formError, setFormError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const typed = email.trim();
    if (!typed) {
      setEmailError('Enter the email address you sign in with');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: typed }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.errors?.email) setEmailError(data.errors.email);
        else setFormError(data.error || 'The request could not be sent. Please try again.');
        setIsSubmitting(false);
        return;
      }

      setSentTo(typed);
    } catch {
      setFormError('The request could not be sent. Check your connection and try again.');
    }
    setIsSubmitting(false);
  };

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
            <h1 className="auth-title">{sentTo ? 'Check your email' : 'Reset your password'}</h1>
            <p className="auth-subtitle">
              {sentTo ? (
                <>
                  If <strong className="text-white break-all">{sentTo}</strong> signs in to Run As
                  One, a link to choose a new password is on its way. It works once, for 60
                  minutes.
                </>
              ) : (
                'Enter the email address you sign in with, and we will send you a link to choose a new password.'
              )}
            </p>
          </div>

          {formError && (
            <div className="auth-message auth-error" role="alert">
              {formError}
            </div>
          )}

          {sentTo ? (
            <>
              <p className="text-sm text-secondary m-0">
                Nothing after a few minutes? Check your spam folder. An invitation you have not
                accepted yet cannot be reset — ask Run As One to send the invitation again.
              </p>
              <Link
                href="/admin/login"
                className="btn-gradient auth-submit text-white font-medium mt-6"
              >
                Back to Sign In
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="forgot-email">Email Address</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    setEmailError('');
                  }}
                  className="form-input"
                  placeholder="email@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={isSubmitting}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? 'forgot-email-error' : undefined}
                />
                <FieldError id="forgot-email-error" message={emailError} />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-gradient auth-submit text-white font-medium"
              >
                {isSubmitting ? <BusyLabel>Sending</BusyLabel> : 'Send Reset Link'}
              </button>
            </form>
          )}

          {!sentTo && (
            <div className="auth-footer">
              Remembered it?{' '}
              <Link href="/admin/login" className="auth-link">
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
