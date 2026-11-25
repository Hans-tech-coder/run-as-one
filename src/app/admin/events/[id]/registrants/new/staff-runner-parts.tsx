"use client";

import React from 'react';
import FieldError from '@/components/ui/FieldError';
import { upperCaseAsTyped } from '@/lib/text-case';
import type { RunnerAddressField } from '@/lib/runner-address';
import { runnerFieldId, type RunnerField } from '@/app/events/[slug]/register/validation';

/**
 * The small pieces one runner's panel on the staff registration form is
 * built from (`StaffRunnerFields.tsx`), and the field ids its error summary
 * links to.
 */

/** The id RunnerAddressEditor gives an address field, for focusing it. */
export function addressFieldId(index: number, field: RunnerAddressField): string {
  return `runner-${index}-address-${field.replace('address', '').toLowerCase()}`;
}

/** Where the caret goes for a field's error. */
export function staffFieldId(index: number, field: RunnerField): string {
  return field.startsWith('address') ? addressFieldId(index, field as RunnerAddressField) : runnerFieldId(index, field);
}

export function TextField({
  index,
  field,
  label,
  value,
  error,
  onChange,
  onBlur,
  type = 'text',
  inputMode,
  placeholder,
  upper = false,
  optional = false,
}: {
  index: number;
  field: RunnerField | 'medicalConditions' | 'runningCommunity';
  label: string;
  value: string;
  error?: string;
  onChange: (next: string) => void;
  /** Checks the field as staff leave it, so a bad email shows before Save. */
  onBlur?: () => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
  upper?: boolean;
  optional?: boolean;
}) {
  const id = runnerFieldId(index, field as RunnerField);
  const errorId = `${id}-error`;
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
        {optional && <span className="text-xs opacity-70"> - optional</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(upper ? upperCaseAsTyped(e.target.value) : e.target.value)}
        onBlur={onBlur}
        className="form-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/**
 * Runner 2 onwards: a tick to use Runner 1's answer instead of typing one.
 * While on, the field shows Runner 1's value read-only, so staff see what the
 * runner will get; it follows Runner 1's edits.
 */
export function SameAsFirst({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 min-h-11 text-sm text-secondary cursor-pointer select-none">
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 shrink-0" />
      {label}
    </label>
  );
}

/** A field shown as Runner 1's, not editable here. */
export function CopiedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="form-group">
      <span className="form-label">{label}</span>
      <div className="form-input flex items-center text-secondary truncate" aria-readonly="true">
        {value || <span className="text-[var(--ink-30)]">Runner 1’s, not entered yet</span>}
      </div>
    </div>
  );
}
