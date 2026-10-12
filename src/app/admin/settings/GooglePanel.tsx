"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Unlink } from 'lucide-react';
import { useAlert } from '@/components/ui/AlertProvider';
import BusyLabel from '@/components/ui/BusyLabel';
import PasswordField from '../PasswordField';
import { SaveConfirmation } from './SettingsPanels';

/**
 * **Google sign-in** on Settings › Security, for staff and client viewers
 * (LOGIN_UX_PLAN.md D7). Linked: it says so, and *Unlink Google* asks for the
 * current password (`PATCH /api/admin/profile/google`). Not linked: it says how
 * a link is made — "Continue with Google" with the account's own email — since
 * there is nothing to press here. The owner never sees it (D5).
 */
export default function GooglePanel({ linked, email }: { linked: boolean; email: string }) {
  const router = useRouter();
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [unlinked, setUnlinked] = useState(false);

  const handleUnlink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your current password');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/profile/google', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.errors?.password) {
          setError(data.errors.password);
          return;
        }
        throw new Error(data.error || 'Could not unlink Google. Please try again.');
      }
      setPassword('');
      setUnlinked(true);
      router.refresh();
    } catch (err: unknown) {
      await alert(err instanceof Error ? err.message : 'Could not unlink Google. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="admin-panel" aria-labelledby="google-sign-in-title">
      <div className="admin-panel-header">
        <h2 id="google-sign-in-title" className="admin-panel-title flex items-center gap-2">
          <Link2 size={18} className="text-accent-blue-ink" aria-hidden="true" />
          Google Sign-in
        </h2>
      </div>
      <div className="admin-panel-content">
        <dl className="settings-facts">
          <div>
            <dt>Google</dt>
            <dd>{linked ? 'Linked' : 'Not linked'}</dd>
          </div>
        </dl>

        {linked ? (
          <form onSubmit={handleUnlink} noValidate>
            <p className="text-xs text-secondary mt-3">
              You can sign in with <strong>Continue with Google</strong>, even if
              you change your email here. Unlinking leaves your password as the
              way in; the next Google sign-in with {email} links again.
            </p>
            <div className="form-grid mt-4">
              <div className="form-group-full">
                <PasswordField
                  label="Current Password"
                  value={password}
                  onChange={value => {
                    setPassword(value);
                    setError('');
                  }}
                  autoComplete="current-password"
                  error={error}
                  disabled={isSaving}
                />
              </div>
            </div>
            <div className="form-actions settings-actions">
              <button type="submit" className="btn-light" disabled={isSaving || !password}>
                {isSaving ? (
                  <BusyLabel>Unlinking</BusyLabel>
                ) : (
                  <>
                    <Unlink size={16} aria-hidden="true" />
                    Unlink Google
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-xs text-secondary mt-3">
              To sign in with Google, choose <strong>Continue with Google</strong> on
              the sign-in page with the Google account for {email}. It links the
              first time.
            </p>
            <div className="form-actions settings-actions">
              <SaveConfirmation visible={unlinked} message="Google unlinked" />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
