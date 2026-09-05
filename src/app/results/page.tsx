import React from 'react';
import Link from 'next/link';
import { ChevronRight, Trophy } from 'lucide-react';
import db from '@/lib/db';
import ResultsClientOrchestrator from '@/components/ResultsClientOrchestrator';
import EventGrid from '@/components/EventGrid';
import { mostRecentFirst } from '@/lib/event-schedule';

export default async function GlobalResultsPage() {
  // Only races whose organizer has actually uploaded times. A race that is over
  // but has no results yet appears nowhere on the site — it has left /events,
  // and there is nothing here to read — which is deliberate: an entry that
  // opened onto an empty ranking would be a dead end.
  //
  // Ordered most recent first, so the race people have just come home from is
  // the one at the top. See src/lib/event-schedule.ts.
  const events = await db.event.findMany({
    where: {
      raceResults: {
        some: {}
      }
    },
    orderBy: mostRecentFirst,
  });

  return (
    <div className="relative overflow-hidden w-full flex flex-col items-center">
      {/* Background Orbs */}
      <div className="absolute -top-[10%] -left-[10%] w-[800px] h-[800px] bg-accent-blue opacity-15 blur-[200px] -z-10 rounded-full" />
      <div className="absolute top-[20%] -right-[10%] w-[600px] h-[600px] bg-accent-orange opacity-15 blur-[200px] -z-10 rounded-full" />
      
      <div className="w-full relative z-10 flex flex-col items-center gap-8 sm:gap-12">
        
        <div className="text-center w-full max-w-3xl mb-0 sm:mb-4 t-stagger is-shown">
          <div className="flex flex-row w-fit mx-auto items-center justify-center gap-2 mb-4 t-stagger-line t-stagger-line--1">
            <Trophy size={20} className="text-accent-blue" />
            <span className="text-sm font-bold tracking-widest uppercase text-accent-orange">Official Rankings</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 uppercase tracking-tighter leading-tight mb-4 sm:mb-6 t-stagger-line t-stagger-line--2">
            Race Results
          </h1>
          <p className="text-base sm:text-lg text-secondary leading-relaxed t-stagger-line t-stagger-line--3">
            Select an event to view the official race results and your runner analytics.
          </p>
        </div>

        {events.length === 0 ? (
          <NoResultsYet />
        ) : (
          // Same card as /events, so an event looks like itself whether it is
          // open for registration or already run — only the button changes.
          <EventGrid events={events} action="results" />
        )}
      <ResultsClientOrchestrator />
      </div>
    </div>
  );
}

/**
 * What this page shows before any organizer has uploaded a result.
 *
 * A runner reaching /results early is not looking at a broken page — they are
 * early — so this states that plainly, says who publishes results and when, and
 * hands them the one thing they can still do: go find a race. The panel is the
 * winners-board panel from /events/[slug]/results (same 24px radius, gradient
 * fill, inset highlight, blurred accent orb) so an empty results page and a
 * full one are recognisably the same surface.
 */
function NoResultsYet() {
  const steps = [
    'You run the race.',
    'The organizer uploads the official times, usually within a few days.',
    'Your finish time, ranking and e-certificate appear here.',
  ];

  return (
    <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 sm:p-10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
      <div className="pointer-events-none absolute -mr-32 -mt-32 right-0 top-0 h-[300px] w-[300px] rounded-full bg-accent-orange/10 blur-[80px]" />
      <div className="pointer-events-none absolute -mb-32 -ml-32 bottom-0 left-0 h-[240px] w-[240px] rounded-full bg-accent-blue/10 blur-[80px]" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[20px] border border-accent-orange/20 bg-accent-orange/10 text-accent-orange shadow-[0_0_20px_rgba(255,107,0,0.15)]">
          <Trophy size={30} />
        </div>

        <h2 className="mb-3 text-2xl sm:text-3xl font-black uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
          No Results Published Yet
        </h2>
        <p className="max-w-md text-base text-secondary leading-relaxed">
          Nothing has been posted here so far. Results go up after a race, once
          the organizer has uploaded the official times.
        </p>
      </div>

      {/* Numbered rather than iconised: these are three points in time, and the
          order is the whole message. */}
      <ol className="relative z-10 mt-8 mb-8 flex list-none flex-col gap-3 p-0">
        {steps.map((step, idx) => (
          <li
            key={idx}
            className="flex items-center gap-4 rounded-[16px] border border-white/[0.05] bg-black/40 p-4 text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
              {idx + 1}
            </span>
            <span className="text-sm sm:text-base text-secondary leading-relaxed">
              {step}
            </span>
          </li>
        ))}
      </ol>

      <div className="relative z-10 flex justify-center">
        <Link
          href="/events"
          className="btn-gradient w-full sm:w-auto justify-center rounded-[16px] px-8 py-4 text-base text-center group no-underline shadow-xl shadow-accent-orange/20"
        >
          <span>Browse Events</span>
          <ChevronRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
