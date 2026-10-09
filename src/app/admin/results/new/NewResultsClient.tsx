'use client';

import React, { useState } from 'react';
import { CalendarCheck, FileSpreadsheet } from 'lucide-react';
import type { PickableEvent } from './EventPicker';
import ExistingRaceFlow from './ExistingRaceFlow';
import ResultsOnlyFlow from './ResultsOnlyFlow';

type Choice = 'existing' | 'results-only';

const CHOICES: { value: Choice; title: string; description: string; icon: typeof CalendarCheck }[] = [
  {
    value: 'existing',
    title: 'Event is already in the system',
    description: 'Runners registered here. Pick the race, and its details and categories come with it.',
    icon: CalendarCheck,
  },
  {
    value: 'results-only',
    title: 'Results only, registration was elsewhere',
    description: 'The client took sign-ups on their own. Enter the race details, then upload its results.',
    icon: FileSpreadsheet,
  },
];

/**
 * The two ways a race's results start (RESULTS_NAV_PLAN.md R2), as the two
 * large choices the create form's event type uses (`EventOptionsPanel`), then
 * that choice's three steps on this same page — 1. the race, 2. its results,
 * 3. its e-certificate — saved by one Save at the foot. The owner's call after
 * the first cut (details, then Save and Continue to the workspace) confused
 * staff: a page that moves you on before the job is done reads as a page that
 * lost it. Only a finished Save opens the race's workspace.
 */
export default function NewResultsClient({
  events,
  defaultAdminFee,
}: {
  events: PickableEvent[];
  defaultAdminFee: number;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);

  return (
    <div className="admin-form">
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h2 className="admin-panel-title">Where did runners register?</h2>
        </div>
        <div className="admin-panel-content">
          <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="Where did runners register?">
            {CHOICES.map(option => {
              const Icon = option.icon;
              const isSelected = choice === option.value;
              return (
                <label
                  key={option.value}
                  className={`relative flex cursor-pointer flex-col gap-3 rounded-xl border p-4 sm:p-5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-blue ${
                    isSelected
                      ? 'border-accent-blue bg-accent-blue/10'
                      : 'border-[var(--dash-border)] bg-[var(--ink-02)] hover:border-[var(--ink-20)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="resultsSource"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => setChoice(option.value)}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-lg p-2 ${
                        isSelected ? 'bg-accent-blue/20 text-accent-blue-ink' : 'bg-[var(--ink-05)] text-secondary'
                      }`}
                    >
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span className="font-medium text-primary">{option.title}</span>
                  </div>
                  <p className="m-0 text-sm leading-relaxed text-secondary">{option.description}</p>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {choice === 'existing' && <ExistingRaceFlow events={events} />}
      {choice === 'results-only' && <ResultsOnlyFlow defaultAdminFee={defaultAdminFee} />}
    </div>
  );
}
