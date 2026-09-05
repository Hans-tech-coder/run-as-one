"use client";

import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import FieldError from '@/components/ui/FieldError';

/**
 * A password box the organizer can read back.
 *
 * It is the admin `.form-input` with room made on the right for a reveal
 * button, not a new control — the border, focus ring and invalid state all
 * still come from Admin.css, so it sits in a form next to a name field without
 * looking like it came from somewhere else.
 *
 * The reveal exists because every character here is typed blind, and a
 * mistyped new password is only discovered at the next sign-in. `autoComplete`
 * is passed in rather than assumed: a password manager needs to be told which
 * of the three boxes is the old one and which is the replacement.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  // A field with both a hint and an error is read hint-first, so the runner of
  // the screen reader hears the rule and then how this entry broke it.
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>

      <div className="password-field">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          className="form-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setRevealed(r => !r)}
          // The label says what the button will do, not what state it is in,
          // which is the half a screen reader user cannot see for themselves.
          aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={revealed}
          disabled={disabled}
        >
          {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-secondary">
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
