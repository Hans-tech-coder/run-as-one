"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, ChevronRight, Search, SearchX, X } from 'lucide-react';
import EventGrid from './EventGrid';

type DBEvent = {
  id: string;
  slug: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
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

  return (
    <section className="w-full flex flex-col items-center gap-8 sm:gap-12">
      <div className="flex items-center w-full max-w-[850px] px-4 sm:px-6 py-3 sm:py-4 rounded-full gap-3 sm:gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.2)] bg-white/5 backdrop-blur-xl border border-white/10 focus-within:border-accent-blue/50 transition-colors">
        <Search className="text-secondary shrink-0 ml-1 sm:ml-2" size={22} />
        <label htmlFor="home-event-search" className="sr-only">
          Search races by name or location
        </label>
        <input
          id="home-event-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by race or location..."
          className="flex-1 bg-transparent border-none text-white text-base sm:text-xl font-body outline-none placeholder-gray-500 w-full min-w-0 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {/* Replaces a filter button that was never wired to anything. Only
            present once there is something to clear, so the pill stays calm
            when the field is empty. */}
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full bg-white/5 text-white cursor-pointer transition-colors hover:bg-white/15 border-none p-0"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="w-full">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <div className="flex flex-row items-center gap-2 mb-2">
              <Calendar size={18} className="text-accent-blue" />
              <span className="text-xs sm:text-sm font-bold tracking-widest uppercase text-accent-orange">
                {trimmed ? 'Search Results' : 'Upcoming Events'}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white m-0">
              {trimmed
                ? `${matches.length} ${matches.length === 1 ? 'race' : 'races'} found`
                : 'Open For Registration'}
            </h2>
          </div>

          {/* Only worth offering when the home page is not already showing
              everything there is. */}
          {totalEvents > events.length && (
            <Link
              href="/events"
              className="group bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-2.5 px-4 rounded-[16px] font-bold text-sm tracking-wide flex items-center gap-1 shrink-0 no-underline"
            >
              View all {totalEvents}
              <ChevronRight
                size={16}
                className="group-hover:translate-x-1 transition-transform inline-block"
              />
            </Link>
          )}
        </div>

        {matches.length > 0 ? (
          <EventGrid events={matches} />
        ) : (
          <EmptyState
            query={trimmed ? query.trim() : null}
            onClear={() => setQuery('')}
          />
        )}
      </div>
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
    <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 sm:p-10 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
      <div className="pointer-events-none absolute -mr-32 -mt-32 right-0 top-0 h-[300px] w-[300px] rounded-full bg-accent-blue/10 blur-[80px]" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[20px] border border-accent-blue/20 bg-accent-blue/10 text-accent-blue shadow-[0_0_20px_rgba(0,122,255,0.15)]">
          {query ? <SearchX size={30} /> : <Calendar size={30} />}
        </div>

        <h3 className="mb-3 text-xl sm:text-2xl font-black uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
          {query ? 'No Races Match That' : 'No Events Posted Yet'}
        </h3>
        <p className="max-w-md text-base text-secondary leading-relaxed">
          {query ? (
            <>
              Nothing here matches <span className="text-white">{query}</span>.
              Try a shorter word, or a city instead of a race name.
            </>
          ) : (
            'Organizers have not published a race yet. Check back soon — this is where new events land first.'
          )}
        </p>

        {query && (
          <button
            type="button"
            onClick={onClear}
            className="mt-6 bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-3 px-6 rounded-[16px] font-bold text-sm uppercase tracking-wider"
          >
            Clear search
          </button>
        )}
      </div>
    </div>
  );
}
