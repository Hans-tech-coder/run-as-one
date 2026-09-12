"use client";

import React from 'react';
import { CalendarClock, DoorOpen } from 'lucide-react';
import {
  DEFAULT_OPENING_TIME,
  OPENS_IMMEDIATELY,
  isScheduledOpening,
  type OpeningDraft,
} from './registration-opening';

/**
 * Chooses when an event starts taking sign-ups.
 *
 * Radio cards rather than a checkbox or a bare date field, for the same reason
 * the registration-form picker uses them: this decides whether the Register
 * button on a published race works at all, and a lone date input with nothing
 * in it says nothing about which of the two the organizer meant. The two
 * answers are shown side by side and one of them is always chosen.
 *
 * The date and time only appear once the second card is picked. Before that
 * they would be two empty boxes belonging to a decision that has not been
 * made, and an organizer who wants their race open now should not have to read
 * past them.
 *
 * Shared by the create form, the edit form and the events table's scheduling
 * modal, so a race's opening is set the same way wherever it is set from.
 */
export default function RegistrationOpeningPicker({
  value,
  onChange,
  idPrefix = 'registrationOpening',
  error,
}: {
  value: OpeningDraft;
  onChange: (next: OpeningDraft) => void;
  /**
   * Namespaces the radio group and the field ids. Needed because the modal can
   * be on the page at the same time as nothing else, but the edit form is one
   * of several forms in a layout, and two radio groups sharing a name would
   * fight each other.
   */
  idPrefix?: string;
  /** Why the date is unusable, shown under the field it belongs to. */
  error?: string | null;
}) {
  const scheduled = isScheduledOpening(value);
  const dateId = `${idPrefix}-day`;
  const timeId = `${idPrefix}-time`;
  const errorId = `${idPrefix}-error`;

  const options = [
    {
      scheduled: false,
      icon: DoorOpen,
      title: 'Open Immediately',
      description:
        'Runners can register the moment this event is published. This is how most races are run.',
    },
    {
      scheduled: true,
      icon: CalendarClock,
      title: 'Schedule The Opening',
      description:
        'The race is listed publicly straight away so runners can plan for it, and the Register button turns on by itself at the date you set.',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = scheduled === option.scheduled;

          return (
            <label
              key={option.title}
              className={`relative flex cursor-pointer flex-col gap-3 rounded-xl border p-5 transition-colors focus-within:border-accent-blue focus-within:ring-2 focus-within:ring-accent-blue/40 ${
                isSelected
                  ? 'border-accent-blue bg-accent-blue/10'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <input
                type="radio"
                name={idPrefix}
                checked={isSelected}
                onChange={() =>
                  onChange(
                    option.scheduled
                      ? // Switching to a schedule with nothing in it yet starts
                        // at a time of day worth announcing rather than at
                        // midnight — see DEFAULT_OPENING_TIME. The date stays
                        // empty on purpose: it is the organizer's to pick, and
                        // the fields this reveals are where they pick it. An
                        // organizer coming back to a draft they already filled
                        // in keeps what they typed.
                        { scheduled: true, day: value.day, time: value.time || DEFAULT_OPENING_TIME }
                      : OPENS_IMMEDIATELY,
                  )
                }
                className="sr-only"
              />
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-lg p-2 ${
                    isSelected ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/5 text-gray-400'
                  }`}
                >
                  <Icon size={20} />
                </span>
                <span className="font-medium text-primary">{option.title}</span>
              </div>
              <p className="text-sm leading-relaxed text-secondary">{option.description}</p>
            </label>
          );
        })}
      </div>

      {scheduled && (
        <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/20 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="form-label" htmlFor={dateId}>
                Opening Date
              </label>
              <input
                id={dateId}
                type="date"
                value={value.day}
                onChange={(e) => onChange({ ...value, day: e.target.value })}
                className="form-input"
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={timeId}>
                Opening Time
              </label>
              <input
                id={timeId}
                type="time"
                value={value.time}
                onChange={(e) => onChange({ ...value, time: e.target.value })}
                className="form-input"
              />
            </div>
          </div>

          {/* Under the fields it is about, not at the top of the form: the
              organizer has to be able to see which box to fix. */}
          {error && (
            <p id={errorId} role="alert" className="text-sm font-medium text-red-400 m-0">
              {error}
            </p>
          )}

          <p className="text-xs opacity-70 m-0">
            Philippine time. Until it passes, the event page shows the opening date in
            place of the Register button — nobody has to come back and switch it on.
            A date already gone means sign-ups are open now.
          </p>
        </div>
      )}
    </div>
  );
}
