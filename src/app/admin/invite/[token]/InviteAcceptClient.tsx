"use client";

import React, { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck } from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import FieldError from '@/components/ui/FieldError';
import PasswordField from '../../settings/PasswordField';
import { ROLE_HINTS, type MembershipRole } from '@/lib/permissions';
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH, newPasswordErrors, type FieldErrors } from '@/lib/team';

/**
 * Accepting an invitation: the form half of `/admin/invite/[token]`.
 *
 * It says what is being accepted before it asks for anything — which organizer,
 * and exactly which races and roles — because a person choosing a password for
 * an account should know what that account opens.
 *
 * A new person names themselves and chooses a password (twice, with the
 * reveal button, since a mistyped one is only discovered at the next sign-in).
 * Someone who already signs in to another organizer enters the password they
 * already have; they are not asked to invent a second one.
 *
 * Errors sit under the field they are about and are rebuilt from what is
 * actually wrong on every submit (PROJECT_GUIDE §8, rule 4). The server checks
 * the same rules from lib/team.ts and answers in the same shape.
 */
export default function InviteAcceptClient({
  token,
  organizerName,
  email,
  invitedName,
  hasAccount,
  role,
  events,
}: {
  token: string;
  organizerName: string;
  email: string;
  invitedName: string;
  hasAccount: boolean;
  role: MembershipRole;
  events: { title: string; roleLabel: string }[];
}) {
  const router = useRouter();
  const nameId = useId();

  const [name, setName] = useState(invitedName);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clear = (field: string) =>
    setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));

  const validate = (): FieldErrors => {
    if (hasAccount) {
      return password ? {} : { password: 'Enter the password you already sign in with' };
    }
    const found = newPasswordErrors(password, confirmPassword);
    if (!name.trim()) found.name = 'Enter your name as your team should see it';
    else if (name.trim().length > MAX_NAME_LENGTH) {
      found.name = `Keep your name to ${MAX_NAME_LENGTH} characters or fewer`;
    }
    return found;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/auth/invite/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          hasAccount ? { password } : { name: name.trim(), password, confirmPassword },
        ),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.errors) {
          setErrors(data.errors);
        } else {
          setFormError(data.error || 'The invitation could not be accepted. Please try again.');
        }
        setIsSubmitting(false);
        return;
      }

      // Signed in by the route itself; the dashboard is theirs now. The button
      // keeps saying so until the page arrives, rather than coming back to life
      // over a form that has already done its job.
      router.replace('/admin');
      router.refresh();
    } catch {
      setFormError('The invitation could not be accepted. Check your connection and try again.');
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
          <h1 className="auth-title">Join {organizerName}</h1>
          <p className="auth-subtitle">
            {role === 'ADMIN'
              ? `You have been invited as an Admin. ${ROLE_HINTS.ADMIN}`
              : 'You have been invited to work on these events:'}
          </p>
        </div>

        {role === 'STAFF' && events.length > 0 && (
          <ul className="mb-6 flex flex-col gap-2 list-none p-0">
            {events.map(event => (
              <li
                key={`${event.title}-${event.roleLabel}`}
                className="flex items-center gap-3 rounded-[10px] border border-white/10 bg-black/30 px-4 py-3"
              >
                <CalendarCheck size={16} className="shrink-0 text-accent-orange" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {event.title}
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
                  {event.roleLabel}
                </span>
              </li>
            ))}
          </ul>
        )}

        {formError && (
          <div className="auth-message auth-error" role="alert">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {hasAccount ? (
            <p className="text-sm text-secondary m-0">
              You already sign in as <strong className="text-white">{email}</strong>. Enter that
              password to add {organizerName} to your account — your other organizers stay as they
              are.
            </p>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor={nameId}>
                  Your Name
                </label>
                <input
                  id={nameId}
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    clear('name');
                  }}
                  autoComplete="name"
                  disabled={isSubmitting}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? `${nameId}-error` : `${nameId}-hint`}
                />
                <FieldError id={`${nameId}-error`} message={errors.name} />
                {!errors.name && (
                  <p id={`${nameId}-hint`} className="text-xs text-secondary">
                    Everything you do in the admin is recorded under this name.
                  </p>
                )}
              </div>

              <div className="form-group">
                <span className="form-label">Email Address</span>
                {/* Shown, not editable: it is the address the invitation was
                    sent to, and the one this account will sign in with. */}
                <p className="m-0 text-sm text-white">{email}</p>
              </div>
            </>
          )}

          <PasswordField
            label={hasAccount ? 'Your Password' : 'Choose a Password'}
            value={password}
            onChange={value => {
              setPassword(value);
              clear('password');
              clear('confirmPassword');
            }}
            autoComplete={hasAccount ? 'current-password' : 'new-password'}
            error={errors.password}
            hint={hasAccount ? undefined : `At least ${MIN_PASSWORD_LENGTH} characters. Only you will know it.`}
            disabled={isSubmitting}
          />

          {!hasAccount && (
            <PasswordField
              label="Confirm Password"
              value={confirmPassword}
              onChange={value => {
                setConfirmPassword(value);
                clear('confirmPassword');
              }}
              autoComplete="new-password"
              error={errors.confirmPassword}
              disabled={isSubmitting}
            />
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-gradient auth-submit text-white font-medium"
          >
            {isSubmitting ? 'Joining…' : 'Accept and Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
