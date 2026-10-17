"use client";

import React from 'react';
import { CalendarClock, FilePen, Globe } from 'lucide-react';
import AdminDatePicker from '../AdminDatePicker';
import { DEFAULT_OPENING_TIME } from './registration-opening';
import type { PublishDraft, PublishMode } from './publish-draft';

/**
 * Chooses when an event goes public: keep it a draft, publish it now, or
 * publish it at a date and time (EVENT_PUBLISH_PLAN.md).
 *
 * Radio cards like RegistrationOpeningPicker beside it, so the two "when"
 * questions on an event look alike — and their descriptions say how they
 * differ, since one hides the whole event and the other only the Register
 * button. Shared by the create form and the events table's publishing modal.
 */
export default function PublishPicker({
  value,
  onChange,
  idPrefix = 'publish',
  error,
  allowDraft = true,
}: {
  value: PublishDraft;
  onChange: (next: PublishDraft) => void;
  /** Namespaces the radio group and field ids, as on the opening picker. */
  idPrefix?: string;
  error?: string | null;
  /** False once the event has registrations: it can no longer be hidden. */
  allowDraft?: boolean;
}) {
  const dateId = `${idPrefix}-day`;
  const timeId = `${idPrefix}-time`;
  const errorId = `${idPrefix}-error`;

  const options: { mode: PublishMode; icon: typeof Globe; title: string; description: string }[] = [
    {
      mode: 'DRAFT',
      icon: FilePen,
      title: 'Save As Draft',
      description: 'Only your team can see it. Publish it from the events list once it is ready.',
    },
    {
      mode: 'NOW',
      icon: Globe,
      title: 'Publish Now',
      description: 'The event is listed on the site as soon as you save.',
    },
    {
      mode: 'SCHEDULED',
      icon: CalendarClock,
      title: 'Schedule Publishing',
      description: 'Hidden until the date you set, then listed by itself. Nobody has to press anything.',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {options
          .filter(option => allowDraft || option.mode !== 'DRAFT')
          .map(option => {
            const Icon = option.icon;
            const isSelected = value.mode === option.mode;
            return (
              <label
                key={option.mode}
                className={`relative flex cursor-pointer flex-col gap-3 rounded-xl border p-4 sm:p-5 transition-colors focus-within:border-accent-blue focus-within:ring-2 focus-within:ring-accent-blue/40 ${
                  isSelected
                    ? 'border-accent-blue bg-accent-blue/10'
                    : 'border-[var(--dash-border)] bg-[var(--ink-02)] hover:border-[var(--ink-20)]'
                }`}
              >
                <input
                  type="radio"
                  name={idPrefix}
                  checked={isSelected}
                  onChange={() =>
                    onChange(
                      option.mode === 'SCHEDULED'
                        ? { mode: 'SCHEDULED', day: value.day, time: value.time || DEFAULT_OPENING_TIME }
                        : { ...value, mode: option.mode },
                    )
                  }
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-lg p-2 ${
                      isSelected ? 'bg-accent-blue/20 text-accent-blue-ink' : 'bg-[var(--ink-05)] text-secondary'
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="font-medium text-primary">{option.title}</span>
                </div>
                <p className="text-sm leading-relaxed text-secondary m-0">{option.description}</p>
              </label>
            );
          })}
      </div>

      {value.mode === 'SCHEDULED' && (
        <div className="flex flex-col gap-4 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-sunken)] p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminDatePicker
              id={dateId}
              label="Publish Date"
              className="min-w-0"
              value={value.day}
              dialogLabel="Choose the publish date"
              onChange={day => onChange({ ...value, day })}
              invalid={Boolean(error)}
              describedBy={error ? errorId : undefined}
            />
            <div className="form-group min-w-0">
              <label className="form-label" htmlFor={timeId}>
                Publish Time
              </label>
              <input
                id={timeId}
                type="time"
                value={value.time}
                onChange={e => onChange({ ...value, time: e.target.value })}
                className="form-input"
              />
            </div>
          </div>

          {error && (
            <p id={errorId} role="alert" className="text-sm font-medium text-[var(--status-danger)] m-0">
              {error}
            </p>
          )}

          <p className="text-xs opacity-70 m-0">
            Philippine time. If sign-ups also have an opening date, it must be on or after this.
          </p>
        </div>
      )}

      {value.mode !== 'SCHEDULED' && error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-[var(--status-danger)] m-0">
          {error}
        </p>
      )}
    </div>
  );
}
