'use client';

import React, { useMemo, useState } from 'react';
import { CalendarCheck, ChevronRight, Search, X } from 'lucide-react';
import { formatEventDay } from '@/lib/event-schedule';
import type { CertificateDraft } from '../[id]/certificate-draft';
import type { UploadCategory } from '../[id]/TargetCategoryPicker';
import { StepTitle } from './ResultsSteps';

/** A race the picker offers: run already, in the system, no results yet (R6). */
export type PickableEvent = {
  id: string;
  title: string;
  date: string;
  location: string;
  client: string | null;
  categories: UploadCategory[];
  certificate: CertificateDraft;
};

/**
 * Step 1 of "Event is already in the system": the races that may get
 * results, searched on the page by title or client. Choosing one writes
 * nothing; it fills steps 2 and 3 below with that race. Once chosen the list
 * folds into the race itself, with Change race to open it again.
 */
export default function EventPicker({
  events,
  selected,
  onSelect,
}: {
  events: PickableEvent[];
  selected: PickableEvent | null;
  onSelect: (event: PickableEvent | null) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter(
      event =>
        event.title.toLowerCase().includes(needle) || (event.client ?? '').toLowerCase().includes(needle),
    );
  }, [events, query]);

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <h2 className="admin-panel-title">
          <StepTitle n={1} label="Choose the race" />
        </h2>
        {selected && (
          <button type="button" onClick={() => onSelect(null)} className="btn-filter min-h-11">
            Change race
          </button>
        )}
      </div>
      <div className="admin-panel-content flex flex-col gap-4">
        {selected ? (
          <div className="flex flex-col gap-1 [overflow-wrap:anywhere]">
            <p className="m-0 font-medium text-primary">{selected.title}</p>
            <p className="m-0 text-sm text-secondary">
              {formatEventDay(selected.date)} · {selected.location}
              {selected.client ? ` · ${selected.client}` : ''}
            </p>
            <p className="m-0 text-sm text-secondary">
              Categories: {selected.categories.map(category => category.name).join(', ') || 'None'}
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <CalendarCheck size={40} className="empty-icon" aria-hidden="true" />
            <div>
              <p className="mb-2 font-bold text-primary">No race is waiting for results</p>
              <p className="m-0 max-w-md text-sm leading-relaxed">
                A race shows here once its day has come, until its results are uploaded. Races still to
                come are not listed, and a race that already has results is opened from the Results list.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="search-wrapper">
              <Search className="search-icon" size={16} aria-hidden="true" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="search-input"
                placeholder="Search by race or client..."
                aria-label="Search races by name or client"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent text-[var(--text-muted)] hover:text-[var(--ink-85)] cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <p className="m-0 text-xs text-secondary" aria-live="polite">
              {matches.length === events.length
                ? `${events.length} race${events.length === 1 ? '' : 's'} already run, without results.`
                : `Showing ${matches.length} of ${events.length}.`}
            </p>

            {matches.length === 0 ? (
              <p className="m-0 rounded-lg border border-dashed border-[var(--dash-border)] p-4 text-sm text-secondary">
                No race matches &ldquo;{query.trim()}&rdquo;. Search by the race&apos;s name or its client.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-[var(--dash-border)] overflow-hidden rounded-lg border border-[var(--dash-border)] p-0">
                {matches.map(event => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(event)}
                      className="flex min-h-11 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 py-3 text-left text-primary transition-colors hover:bg-[var(--ink-05)] focus-visible:bg-[var(--ink-05)]"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium [overflow-wrap:anywhere]">{event.title}</span>
                        <span className="text-xs text-secondary [overflow-wrap:anywhere]">
                          {formatEventDay(event.date)} · {event.location}
                          {event.client ? ` · ${event.client}` : ''}
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-secondary" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
