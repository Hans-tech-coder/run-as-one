import React from 'react';
import { publishedEvents } from '@/lib/event-visibility';
import { RESULTS_EVENTS } from '@/lib/event-format';
import Link from 'next/link';
import { ChevronRight, History, Trophy } from 'lucide-react';
import db, { publishCutoff } from '@/lib/public-db';
import ResultsClientOrchestrator from '@/components/ResultsClientOrchestrator';
import EventGrid from '@/components/EventGrid';
import { mostRecentFirst } from '@/lib/event-schedule';
import { EVENT_SITE_CLIENT, eventLinkOrigin, getSiteClient } from '@/lib/site-client';
import { pastWithoutResultsWhere } from '@/lib/past-events';
import { PAST_EVENTS_HREF } from '../events/events-view';

/**
 * Cached per site for at most a minute, like the two event listings (the full
 * note is in src/app/s/[site]/(home)/page.tsx). This one turns on the
 * organizer rather than the clock: a race appears here the moment its times
 * are uploaded, because the upload is a write and a write drops the cached
 * copy (lib/public-db.ts) — a build-time prerender would simply not list it.
 */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

export default async function GlobalResultsPage({ params }: { params: Promise<{ site: string }> }) {
  // Only races whose organizer has actually uploaded times. A race that is over
  // but has no results is not listed here — an entry that opened onto an empty
  // ranking would be a dead end — and is found instead on the Past tab of
  // /events (?view=past, PAST_EVENTS_PLAN.md), which lists every finished race.
  //
  // Ordered most recent first, so the race people have just come home from is
  // the one at the top. See src/lib/event-schedule.ts.
  //
  // On a client's site (CLIENT_SUBDOMAIN_PLAN.md D5) only that client's races,
  // results-only ones included — they never show on /events, but their times
  // belong here like any other. A plain heading, no hero (D8).
  //
  // The races that are over and have no times are counted alongside, in the
  // same pass, so the page can point at them (PAST_EVENTS_PLAN.md §3) — and
  // only when there is one, since a link to a list of races this page already
  // shows would send the runner round in a circle.
  const { site: siteParam } = await params;
  const site = await getSiteClient(siteParam, '/results');
  const linkOrigin = eventLinkOrigin(siteParam);
  const scope = { ...publishedEvents(await publishCutoff()), ...(site ? { clientId: site.id } : {}) };
  const [rows, pastWithoutResults] = await Promise.all([
    db.event.findMany({
      where: {
        ...scope,
        // Never a virtual run, which has no results (lib/event-format.ts).
        ...RESULTS_EVENTS,
        raceResults: {
          some: {}
        },
      },
      orderBy: mostRecentFirst,
      // The client only says which host a card links to (lib/site-client.ts).
      include: { client: EVENT_SITE_CLIENT },
    }),
    db.event.count({ where: pastWithoutResultsWhere(scope) }),
  ]);
  const events = rows.map(({ client, ...event }) => ({ ...event, siteOrigin: linkOrigin({ client }) }));

  return (
    <div className="relative overflow-hidden w-full flex flex-col items-center">
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
            {site
              ? `Official results from every ${site.name} race. Select an event to view the rankings and your runner analytics.`
              : 'Select an event to view the official race results and your runner analytics.'}
          </p>
        </div>

        {events.length === 0 ? (
          <NoResultsYet hasPastEvents={pastWithoutResults > 0} />
        ) : (
          <>
            {/* Same card as /events, so an event looks like itself whether it
                is open for registration or already run — only the button
                changes. */}
            <EventGrid events={events} action="results" />
            {/* One quiet line rather than a button: it is for the runner who
                did not find their race above, not a second thing to do. */}
            {pastWithoutResults > 0 && (
              <p className="m-0 -mt-2 sm:-mt-4 text-center text-sm sm:text-base text-secondary">
                Looking for a race without timed results?{' '}
                <Link
                  href={PAST_EVENTS_HREF}
                  className="inline-flex min-h-11 items-center gap-1 font-semibold text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent-orange"
                >
                  See past events
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
                </Link>
              </p>
            )}
          </>
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
 * winners-board panel from /results/[slug] (same 24px radius, gradient
 * fill, inset highlight, blurred accent orb) so an empty results page and a
 * full one are recognisably the same surface.
 */
function NoResultsYet({ hasPastEvents }: { hasPastEvents: boolean }) {
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

      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/events"
          className="btn-gradient w-full sm:w-auto justify-center rounded-[16px] px-8 py-4 text-base text-center group no-underline shadow-xl shadow-accent-orange/20"
        >
          <span>Browse Events</span>
          <ChevronRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
        </Link>
        {/* The races already run without times are not missing — they are
            on the Past tab — and a runner looking for one should be told
            so (PAST_EVENTS_PLAN.md §3). Only when there is one. */}
        {hasPastEvents && (
          <Link href={PAST_EVENTS_HREF} className="btn-secondary w-full sm:w-auto gap-2">
            <History size={18} className="shrink-0" aria-hidden="true" />
            See Past Events
          </Link>
        )}
      </div>
    </div>
  );
}
