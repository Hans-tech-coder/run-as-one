"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar, Search, SearchX, X } from 'lucide-react';
import EventGrid from './EventGrid';
import LinkPendingIcon from './ui/LinkPendingIcon';

type DBEvent = {
  id: string;
  slug: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
  /** Passed straight through to the card — see EventGrid. */
  registrationClosed?: 'CLOSED' | 'PAUSED' | 'SCHEDULED' | 'FULL' | null;
  registrationOpensAt?: string | Date | null;
  siteOrigin?: string;
  format?: string;
  virtualEndDate?: string | null;
  distances?: string[];
};

/**
 * The events section of the home page, with the search that sits above it.
 *
 * The search box used to be decorative — it held no state and its second
 * button did nothing, so typing a race name changed nothing on screen. It now
 * filters the races below it, which is the only promise the control was ever
 * making. Filtering happens on what is already rendered rather than over the
 * network: the home page carries a handful of events, and a round trip to
 * narrow six cards would be slower than the typing.
 */
export default function HomeEventBrowser({
  events,
  totalEvents,
}: {
  events: DBEvent[];
  totalEvents: number;
}) {
  const [query, setQuery] = useState('');

  const trimmed = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!trimmed) return events;
    return events.filter(
      (event) =>
        event.title.toLowerCase().includes(trimmed) ||
        event.location.toLowerCase().includes(trimmed),
    );
  }, [events, trimmed]);

  // The search sits in the section's own head, beside the title, and only
  // once there are enough cards for it to narrow anything.
  const searchable = events.length > 3;

  return (
    <section id="open-races" className="site-section site-wrap" aria-labelledby="open-races-title">
      <div className="site-section__head">
        <div>
          <h2 id="open-races-title" className="site-h2">
            {trimmed
              ? `${matches.length} ${matches.length === 1 ? 'race matches' : 'races match'}`
              : 'Open for registration'}
          </h2>
          {!trimmed && events.length > 0 && (
            <p className="site-section__sub">
              {totalEvents} upcoming {totalEvents === 1 ? 'race' : 'races'}, soonest first.
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {searchable && (
            <div className="flex h-12 w-full items-center gap-2 rounded-[10px] border border-site-line bg-site-card px-3 focus-within:border-site-ink sm:w-72">
              <Search className="shrink-0 text-site-muted" size={18} aria-hidden="true" />
              <label htmlFor="home-event-search" className="sr-only">
                Search races by name or place
              </label>
              <input
                id="home-event-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by race or place"
                className="w-full min-w-0 flex-1 border-none bg-transparent text-base text-site-ink outline-none placeholder:text-site-muted [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-none bg-transparent p-0 text-site-ink hover:bg-site-surface"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          )}
          {/* Only worth offering when the home page is not already showing
              everything there is. */}
          {totalEvents > events.length && (
            <Link href="/events" className="site-link shrink-0">
              <span>See all {totalEvents} races</span>
              <LinkPendingIcon>
                <ArrowRight size={18} />
              </LinkPendingIcon>
            </Link>
          )}
        </div>
      </div>

      {matches.length > 0 ? (
        <EventGrid events={matches} />
      ) : (
        <EmptyState
          query={trimmed ? query.trim() : null}
          onClear={() => setQuery('')}
        />
      )}
    </section>
  );
}

/**
 * Covers both reasons the grid can be empty — a search that matched nothing,
 * and a platform with no events posted yet. Same panel as the /results empty
 * state so the two read as one family.
 */
function EmptyState({
  query,
  onClear,
}: {
  query: string | null;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-[14px] border border-site-line bg-site-card px-6 py-10 text-center sm:px-10">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-site-surface text-site-ink" aria-hidden="true">
        {query ? <SearchX size={22} /> : <Calendar size={22} />}
      </span>
      <h3 className="site-h3">{query ? 'No races match that' : 'No races posted yet'}</h3>
      <p className="site-lead mt-2 max-w-md">
        {query ? (
          <>
            Nothing here matches <span className="font-semibold text-site-ink">{query}</span>.
            Try a shorter word, or a town instead of a race name.
          </>
        ) : (
          'Organizers have not published a race yet. New races show up here first.'
        )}
      </p>
      {query && (
        <button type="button" onClick={onClear} className="site-btn site-btn--quiet mt-6">
          Clear search
        </button>
      )}
    </div>
  );
}
