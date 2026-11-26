import React from 'react';
import type { Metadata, ResolvingMetadata } from 'next';
import { publishedEvents } from '@/lib/event-visibility';
import { RESULTS_EVENTS } from '@/lib/event-format';
import Link from 'next/link';
import { ArrowRight, History, Trophy } from 'lucide-react';
import db, { publishCutoff } from '@/lib/public-db';
import EventGrid from '@/components/EventGrid';
import { mostRecentFirst } from '@/lib/event-schedule';
import { EVENT_SITE_CLIENT, eventLinkOrigin, findSiteClient, getSiteClient, siteOrigin } from '@/lib/site-client';
import { rootCard, sitePageMetadata } from '@/lib/site-metadata';
import { pastWithoutResultsWhere } from '@/lib/past-events';
import { PAST_EVENTS_HREF } from '../events/events-view';
import PageReveal from '@/components/PageReveal';

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

/** Its own title, description and canonical URL (lib/site-metadata.ts). */
export async function generateMetadata(
  { params }: { params: Promise<{ site: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { site } = await params;
  return sitePageMetadata(await findSiteClient(site), siteOrigin(site), 'results', await rootCard(parent));
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
    <PageReveal>
      <section className="site-section site-wrap" aria-labelledby="results-title">
        <div className="site-section__head">
          <div>
            <h1 id="results-title" className="site-h1">Race Results</h1>
            <p className="site-section__sub max-w-[60ch]">
              {site
                ? `Official times from every ${site.name} race. Open one for the winners, the full leaderboard and your e-certificate.`
                : 'Official times from every race with results. Open one for the winners, the full leaderboard and your e-certificate.'}
            </p>
          </div>
        </div>

        {events.length === 0 ? (
          <NoResultsYet hasPastEvents={pastWithoutResults > 0} />
        ) : (
          <>
            {/* Same card as /events, so an event looks like itself whether it
                is open for registration or already run — only the button
                changes. */}
            <EventGrid events={events} action="results" eagerCount={4} />
            {/* One quiet line rather than a button: it is for the runner who
                did not find their race above, not a second thing to do. */}
            {pastWithoutResults > 0 && (
              <p className="m-0 mt-6 text-center text-[0.9375rem] text-site-muted">
                Looking for a race without timed results?{' '}
                <Link href={PAST_EVENTS_HREF} className="site-link site-link--arrow">
                  <span>See Past Races</span>
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
                </Link>
              </p>
            )}
          </>
        )}
      </section>
    </PageReveal>
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
    <div className="w-full rounded-panel border border-site-line bg-site-card px-6 py-10 sm:px-10">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-control bg-site-surface text-site-ink" aria-hidden="true">
          <Trophy size={22} />
        </div>
        <h2 className="site-h3 mb-2">No Results Published Yet</h2>
        <p className="site-lead max-w-md">
          Nothing has been posted here so far. Results go up after a race, once
          the organizer has uploaded the official times.
        </p>
      </div>

      {/* Numbered rather than iconised: these are three points in time, and the
          order is the whole message. */}
      <ol className="mx-auto mt-6 mb-8 flex max-w-md list-decimal flex-col gap-2 pl-5 text-left text-[0.9375rem] text-site-muted marker:font-semibold marker:text-site-ink">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/events" className="site-btn site-btn--action group w-full sm:w-auto">
          <span>Browse Races</span>
          <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
        {/* The races already run without times are not missing — they are
            on the Past tab — and a runner looking for one should be told
            so (PAST_EVENTS_PLAN.md §3). Only when there is one. */}
        {hasPastEvents && (
          <Link href={PAST_EVENTS_HREF} className="site-btn site-btn--quiet w-full sm:w-auto">
            <History size={18} className="shrink-0" aria-hidden="true" />
            See Past Races
          </Link>
        )}
      </div>
    </div>
  );
}
