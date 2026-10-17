"use client";

import React from 'react';
import { Globe, Lock, MapPin } from 'lucide-react';
import { EVENT_FORMATS, type EventFormat } from '@/lib/event-format';

/**
 * The first question on Create Event and Edit Event: is this a race at a
 * venue, or a virtual run (VIRTUAL_RUN_PLAN.md D3)?
 *
 * First because the answer changes what the rest of the form asks for —
 * BasicInfoPanel swaps the race day, venue and times for a run window — and
 * an organizer should not fill in a venue only to have it disappear. Two
 * cards rather than a dropdown, drawn like the Distance Categories /
 * Packages choice in EventOptionsPanel so the form's two either-or questions
 * look like the same kind of decision.
 *
 * Locked once the event has a registration (D7); the reason is printed under
 * the cards rather than the control going silently grey.
 */

const FORMAT_OPTIONS: {
  value: EventFormat;
  icon: typeof MapPin;
  title: string;
  description: string;
}[] = [
  {
    value: EVENT_FORMATS.ONSITE,
    icon: MapPin,
    title: 'On-site Race',
    description: 'One race day at a venue, with a start time. Runners meet and run together.',
  },
  {
    value: EVENT_FORMATS.VIRTUAL,
    icon: Globe,
    title: 'Virtual Run',
    description:
      'Runners run anywhere, any day inside a run window you set. No venue or start time.',
  },
];

export default function EventFormatPanel({
  format,
  onChange,
  lockedReason,
}: {
  format: EventFormat;
  onChange: (next: EventFormat) => void;
  lockedReason?: string | null;
}) {
  const locked = Boolean(lockedReason);

  return (
    <div className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">Event Format</h2>
      </div>
      <div className="admin-panel-content">
        <div className="form-group form-group-full">
          <label className="form-label">Where do runners run?</label>
          <div className="grid gap-4 md:grid-cols-2">
            {FORMAT_OPTIONS.map(option => {
              const Icon = option.icon;
              const isSelected = format === option.value;
              return (
                <label
                  key={option.value}
                  className={`relative flex flex-col gap-3 rounded-xl border p-4 sm:p-5 transition-colors ${
                    locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  } ${
                    isSelected
                      ? 'border-accent-blue bg-accent-blue/10'
                      : `border-[var(--dash-border)] bg-[var(--ink-02)] ${locked ? '' : 'hover:border-[var(--ink-20)]'}`
                  }`}
                >
                  <input
                    type="radio"
                    name="eventFormat"
                    value={option.value}
                    checked={isSelected}
                    disabled={locked}
                    onChange={() => onChange(option.value)}
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
                  <p className="text-sm leading-relaxed text-secondary">{option.description}</p>
                </label>
              );
            })}
          </div>
          {lockedReason && (
            <p className="flex items-start gap-2 text-xs opacity-70 mt-3 m-0">
              <Lock size={14} className="shrink-0 mt-0.5" />
              {lockedReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
