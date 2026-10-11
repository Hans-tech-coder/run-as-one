"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import BusyLabel from '@/components/ui/BusyLabel';
import PasswordField from '../../PasswordField';
import { MIN_PASSWORD_LENGTH, newPasswordErrors, type FieldErrors } from '@/lib/team';

/**
 * The form half of `/admin/reset-password/[token]`: a new password, twice. The
 * route checks the same rules (`newPasswordErrors`) and answers in the same
 * shape. A success does not sign in (LOGIN_UX_PLAN.md D3) — it goes to the
 * sign-in page with the "Password updated" banner.
 */
export default function ResetPasswordClient({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [gone, setGone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clear = (field: string) =>
    setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const found = newPasswordErrors(password, confirmPassword);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/auth/reset-password/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.errors) setErrors(data.errors);
        else setFormError(data.error || 'The password could not be changed. Please try again.');
        if (res.status === 410) setGone(true);
        setIsSubmitting(false);
        return;
      }

      // The button keeps saying so until the sign-in page arrives.
      router.replace('/admin/login?reset=1');
    } catch {
      setFormError('The password could not be changed. Check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-bg-shape orange"></div>
      <div className="auth-bg-shape blue"></div>

      <div className="auth-card">
        <div className="auth-header">
          <RunAsOneLogo variant="stacked" className="[--rao-logo-size:64px] mb-5" />
          <h1 className="auth-title">Choose a new password</h1>
          <p className="auth-subtitle">
            Every device signed in to your account will be signed out. You will sign in again with
            the new password.
          </p>
        </div>

        {formError && (
          <div className="auth-message auth-error" role="alert">
            {formError}
          </div>
        )}

        {gone ? (
          <Link href="/admin/forgot-password" className="btn-gradient auth-submit text-white font-medium">
            Request a New Link
          </Link>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <PasswordField
              label="New Password"
              value={password}
              onChange={value => {
                setPassword(value);
                clear('password');
                clear('confirmPassword');
              }}
              autoComplete="new-password"
              error={errors.password}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
              disabled={isSubmitting}
            />

            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChange={value => {
                setConfirmPassword(value);
                clear('confirmPassword');
              }}
              autoComplete="new-password"
              error={errors.confirmPassword}
              disabled={isSubmitting}
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-gradient auth-submit text-white font-medium"
            >
              {isSubmitting ? <BusyLabel>Saving</BusyLabel> : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
