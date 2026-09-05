"use client";

import React, { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, KeyRound, UserCog } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';
import { useAlert } from '@/components/ui/AlertProvider';
import PasswordField from './PasswordField';

/** Kept in step with MIN_PASSWORD_LENGTH in the password route. */
const MIN_PASSWORD_LENGTH = 8;

type FieldErrors = Record<string, string>;

/** Awaitable stand-in for window.alert, handed down from useAlert. */
type AlertFn = (message: string) => Promise<void>;

export type OrganizerProfile = {
  name: string;
  email: string;
};

/**
 * The organizer's own account, in two panels that save separately.
 *
 * Separately on purpose: correcting a typo in your own name should not make
 * you retype your password, and changing a password should not risk saving a
 * half-edited email alongside it. Each panel owns its own submit, its own busy
 * state, and its own confirmation line.
 *
 * Errors are held per field and rendered under the input they belong to, the
 * same way the registration wizard does it — a form that only says "something
 * is wrong" leaves the organizer hunting for what.
 */
export default function AccountSettingsClient({
  organizer,
}: {
  organizer: OrganizerProfile;
}) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();

  return (
    <div className="settings-stack">
      <ProfilePanel organizer={organizer} alert={alert} />
      <PasswordPanel alert={alert} />
    </div>
  );
}

function ProfilePanel({
  organizer,
  alert,
}: {
  organizer: OrganizerProfile;
  alert: AlertFn;
}) {
  const router = useRouter();
  const nameId = useId();
  const emailId = useId();

  const [saved, setSaved] = useState(organizer);
  const [name, setName] = useState(organizer.name);
  const [email, setEmail] = useState(organizer.email);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const isDirty = name !== saved.name || email !== saved.email;

  // A message stops being true the moment the organizer acts on it, so each
  // field drops its own error as it is edited. Leaving it up would have them
  // reading "enter a name" over a box that now has one in it.
  const clearError = (field: string) =>
    setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) {
      next.name = 'Enter the name your runners should see';
    }
    if (!email.trim()) {
      next.email = 'Enter the email address you sign in with';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address, like you@example.com';
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    setJustSaved(false);

    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        // The server answers in the shape the form already renders, so "that
        // email is taken" lands under the email box rather than in a dialog
        // the organizer has to dismiss before they can fix it.
        if (data.errors) {
          setErrors(data.errors);
          return;
        }
        throw new Error(data.error || 'Could not save your profile');
      }

      setSaved(data.organizer);
      setName(data.organizer.name);
      setEmail(data.organizer.email);
      setErrors({});
      setJustSaved(true);
      // Every server component on this side reads the organizer out of the
      // cookie the route just reissued, so refresh rather than leave stale
      // details on screen.
      router.refresh();
    } catch (err: unknown) {
      await alert(
        err instanceof Error ? err.message : 'Could not save your profile'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="admin-panel" onSubmit={handleSubmit} noValidate>
      <div className="admin-panel-header">
        <h2 className="admin-panel-title flex items-center gap-2">
          <UserCog size={18} className="text-accent-blue" aria-hidden="true" />
          Your Profile
        </h2>
      </div>

      <div className="admin-panel-content">
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor={nameId}>
              Organizer Name
            </label>
            <input
              id={nameId}
              type="text"
              className="form-input"
              value={name}
              onChange={e => {
                setName(e.target.value);
                clearError('name');
              }}
              autoComplete="name"
              disabled={isSaving}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
            />
            <FieldError id={`${nameId}-error`} message={errors.name} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={emailId}>
              Email Address
            </label>
            <input
              id={emailId}
              type="email"
              className="form-input"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                clearError('email');
              }}
              autoComplete="email"
              disabled={isSaving}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={
                errors.email ? `${emailId}-error` : `${emailId}-hint`
              }
            />
            <FieldError id={`${emailId}-error`} message={errors.email} />
            {!errors.email && (
              <p id={`${emailId}-hint`} className="text-xs text-secondary">
                This is the address you sign in with.
              </p>
            )}
          </div>
        </div>

        <div className="form-actions settings-actions">
          {/* The confirmation is dropped the moment the organizer edits again,
              so a stale "Profile saved" can never sit beside unsaved work. */}
          <SaveConfirmation
            visible={justSaved && !isDirty}
            message="Profile saved"
          />
          <button
            type="submit"
            className="btn-gradient px-8 py-3"
            disabled={isSaving || !isDirty}
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}

function PasswordPanel({ alert }: { alert: AlertFn }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  const hasInput =
    currentPassword !== '' || newPassword !== '' || confirmPassword !== '';

  /** See the note on the profile panel's clearError. */
  const clearError = (field: string) =>
    setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));

  /** Setter plus its own error, so a corrected box stops being red as it is
   *  corrected. The confirm error is cleared alongside the new password too:
   *  the pair only mismatches together. */
  const edit =
    (set: (value: string) => void, field: string, alsoClear?: string) =>
    (value: string) => {
      set(value);
      clearError(field);
      if (alsoClear) clearError(alsoClear);
    };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!currentPassword) {
      next.currentPassword = 'Enter your current password';
    }
    if (!newPassword) {
      next.newPassword = 'Enter the new password you want to use';
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      next.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    } else if (newPassword === currentPassword) {
      next.newPassword = 'The new password is the same as your current one';
    }
    // Only worth saying once the new password itself is valid — otherwise the
    // organizer is told about two problems when they have made one.
    if (!next.newPassword && confirmPassword !== newPassword) {
      next.confirmPassword = 'This does not match the new password above';
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    setChanged(false);

    try {
      const res = await fetch('/api/admin/profile/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors);
          return;
        }
        throw new Error(data.error || 'Could not change your password');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
      setChanged(true);
    } catch (err: unknown) {
      await alert(
        err instanceof Error ? err.message : 'Could not change your password'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="admin-panel" onSubmit={handleSubmit} noValidate>
      <div className="admin-panel-header">
        <h2 className="admin-panel-title flex items-center gap-2">
          <KeyRound size={18} className="text-accent-orange" aria-hidden="true" />
          Password
        </h2>
      </div>

      <div className="admin-panel-content">
        <div className="form-grid">
          {/* The current password spans the row: it is the question being
              answered, and the two new-password boxes are the answer. */}
          <div className="form-group-full">
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={edit(setCurrentPassword, 'currentPassword')}
              autoComplete="current-password"
              error={errors.currentPassword}
              disabled={isSaving}
            />
          </div>

          <PasswordField
            label="New Password"
            value={newPassword}
            onChange={edit(setNewPassword, 'newPassword', 'confirmPassword')}
            autoComplete="new-password"
            error={errors.newPassword}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            disabled={isSaving}
          />

          <PasswordField
            label="Confirm New Password"
            value={confirmPassword}
            onChange={edit(setConfirmPassword, 'confirmPassword')}
            autoComplete="new-password"
            error={errors.confirmPassword}
            disabled={isSaving}
          />
        </div>

        <div className="form-actions settings-actions">
          {/* Dropped as soon as they start typing again, so a stale
              "Password changed" never sits over a half-filled form. */}
          <SaveConfirmation
            visible={changed && !hasInput}
            message="Password changed"
          />
          <button
            type="submit"
            className="btn-gradient px-8 py-3"
            disabled={isSaving || !hasInput}
          >
            {isSaving ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * "It saved", said beside the button that saved it.
 *
 * A dialog would be the wrong weight here — the organizer would have to
 * dismiss one every time they fixed a typo. The element is always rendered so
 * that role="status" is already in the accessibility tree when the message
 * appears; a live region mounted at the same moment as its text is not
 * reliably announced. Nothing steals focus.
 */
function SaveConfirmation({
  visible,
  message,
}: {
  visible: boolean;
  message: string;
}) {
  return (
    <p className="settings-saved" role="status" aria-live="polite">
      {visible && (
        <>
          <Check size={16} aria-hidden="true" />
          {message}
        </>
      )}
    </p>
  );
}
