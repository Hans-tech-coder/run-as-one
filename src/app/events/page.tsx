import React from 'react';
import type { Prisma } from '@prisma/client';
import EventGrid from '@/components/EventGrid';
import db, { publishCutoff } from '@/lib/public-db';
import { finishedEvents, mostRecentFirst, soonestFirst, upcomingEvents } from '@/lib/event-schedule';
import { publishedEvents } from '@/lib/event-visibility';
import { awaitingResults, takesResults } from '@/lib/event-format';
import { cleanPhotoAlbums } from '@/lib/photo-albums';
import { forListing } from '@/lib/registration-gate';
import { EVENT_SITE_CLIENT, eventLinkOrigin, getSiteClient } from '@/lib/site-client';
import ClientSiteHero, { hasClientHero } from '@/components/ClientSiteHero';
import { Calendar, History } from 'lucide-react';
import { EventsTabSwitch } from './EventsTabs';
import type { EventsView } from './events-view';
import PastEvents from './PastEvents';
import { NoPastEvents, NothingUpcoming } from './EventsEmptyStates';

/**
 * Rendered on every request — the same reason as the home page, which carries
 * the full note (src/app/(home)/page.tsx). In short: a prerendered listing freezes
 * both the data and the clock, so it keeps badging a race Paused after the
 * hold was lifted, keeps a finished race in the grid, and keeps counting down
 * to an opening that has already come. The rows are cached reads
 * (lib/public-db.ts); only the judging is live.
 */
export const dynamic = 'force-dynamic';

/**
 * What a past card is drawn from: card fields only, plus the result count
 * that decides where the card goes (D3), what says whether it may still
 * promise times (`awaitingResults`), and the photo albums behind its camera
 * chip — of which only "any?" reaches the browser.
 */
const PAST_CARD = {
  id: true,
  slug: true,
  title: true,
  date: true,
  location: true,
  imageUrl: true,
  format: true,
  virtualEndDate: true,
  eventType: true,
  resultsOnly: true,
  timedResults: true,
  photoAlbums: true,
  client: EVENT_SITE_CLIENT,
  _count: { select: { raceResults: true } },
} satisfies Prisma.EventSelect;

export default async function EventsPage() {
  // Upcoming is races that have not been run yet, soonest first; Past is every
  // one that has, newest first. See src/lib/event-schedule.ts for where that
  // line is drawn.
  //
  // Both tabs are read and rendered on every visit, whichever one the address
  // asks for (?view=past, PAST_EVENTS_PLAN.md D1), so switching tabs is a swap
  // on the page rather than a navigation through events/loading.tsx
  // (EventsTabSwitch). That costs no extra wake-up of the database: every read
  // here is a cached `publicDb` read, and an uncached one runs in the same
  // request as the rest. What it does cost is the other tab's cards in the
  // page's payload — card fields only, never shown until asked for.
  //
  // The last two counts are only for the Upcoming empty state: an empty
  // listing means something different when the platform has never had a race
  // than when every race it has had is already finished, and the runner
  // deserves to be told which one they are looking at.
  //
  // On a client's site (CLIENT_SUBDOMAIN_PLAN.md D1) this is that client's
  // front page: its races only, counted the same way, under its hero — so its
  // Past tab is that client's track record.
  const [site, linkOrigin] = await Promise.all([getSiteClient(), eventLinkOrigin()]);
  // Published events only, counts included: a draft is not something a runner
  // has "missed" (lib/event-visibility.ts).
  const scope = { ...publishedEvents(await publishCutoff()), ...(site ? { clientId: site.id } : {}) };
  // A results-only race is never enterable here, so it is not upcoming in the
  // sense this page means.
  const upcomingWhere: Prisma.EventWhereInput = { ...upcomingEvents(), resultsOnly: false, ...scope };
  // Past (D2): virtual runs included, and a results-only race only once its
  // times are up — before that its event page is a 404, and a card must never
  // open onto one. finishedEvents() is itself an OR, hence AND rather than a
  // second OR spread beside it.
  const pastWhere: Prisma.EventWhereInput = {
    AND: [finishedEvents(), scope, { OR: [{ resultsOnly: false }, { raceResults: { some: {} } }] }],
  };

  const [upcoming, past, totalEvents, eventsWithResults] = await Promise.all([
    db.event.findMany({
      where: upcomingWhere,
      orderBy: soonestFirst,
      // The slot limits are what decide whether a card is badged FULL;
      // forListing counts against them and then drops them, so nothing about
      // capacity is shipped to the browser.
      // The client only says which host a card links to (lib/site-client.ts).
      include: {
        categories: { select: { id: true, slotLimit: true } },
        client: EVENT_SITE_CLIENT,
      },
    }),
    db.event.findMany({ where: pastWhere, orderBy: mostRecentFirst, select: PAST_CARD }),
    db.event.count({ where: scope }),
    db.event.count({ where: { raceResults: { some: {} }, ...scope } }),
  ]);

  // A race that is full or on hold stays in this listing rather than
  // disappearing from it: it is still upcoming, and a runner who heard about it
  // deserves to find it and read why they cannot enter.
  const events = (await forListing(upcoming)).map(({ client, ...event }) => ({
    ...event,
    siteOrigin: linkOrigin({ client }),
  }));
  // Each past card goes where its race's answer is (D3). A virtual run never
  // has results, whatever rows the table holds.
  const pastCards = past.map(({ client, _count, eventType, resultsOnly, timedResults, photoAlbums, ...event }) => {
    const hasResults = takesResults(event) && _count.raceResults > 0;
    return {
      ...event,
      hasResults,
      hasPhotos: cleanPhotoAlbums(photoAlbums).length > 0,
      resultsSoon: !hasResults && awaitingResults({ ...event, eventType, resultsOnly, timedResults }),
      siteOrigin: linkOrigin({ client }),
    };
  });
  const counts = { upcoming: events.length, past: pastCards.length };
  const hero = site && hasClientHero(site) ? site : null;

  const heading = (view: EventsView) => (
    <div className="text-center w-full max-w-3xl mb-0 sm:mb-4 t-stagger is-shown">
      <div className="flex flex-row w-fit mx-auto items-center justify-center gap-2 mb-4 t-stagger-line t-stagger-line--1">
        {view === 'past' ? <History size={20} className="text-accent-blue" /> : <Calendar size={20} className="text-accent-blue" />}
        <span className="text-sm font-bold tracking-widest uppercase text-accent-orange">
          {view === 'past' ? 'Past Events' : 'Upcoming Events'}
        </span>
      </div>
      <h1 className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 uppercase tracking-tighter leading-tight mb-4 sm:mb-6 t-stagger-line t-stagger-line--2">
        {view === 'past' ? 'Races Already Run' : 'Find Your Next Race'}
      </h1>
      <p className="text-base sm:text-lg text-secondary leading-relaxed t-stagger-line t-stagger-line--3">
        {view === 'past'
          ? `Every race ${site ? `${site.name} has` : 'we have'} held, newest first. Open one for its details, its results or its photos.`
          : site
            ? `Every upcoming race from ${site.name}. Register today and join the community.`
            : 'Browse through all our official marathons, fun runs, and virtual races. Register today and join the community.'}
      </p>
    </div>
  );

  return (
    <>
      {/* Outside the clipping wrapper below: the banner is full-bleed. */}
      {hero && <ClientSiteHero site={hero} />}
      <div className="relative overflow-hidden w-full flex flex-col items-center">
        <div className="w-full relative z-10 flex flex-col items-center gap-8 sm:gap-12">
          {/* Which tab shows is read from the address by the switch, on the
              server as on the client. */}
          <EventsTabSwitch
            counts={counts}
            heading={hero ? undefined : { upcoming: heading('upcoming'), past: heading('past') }}
            panels={{
              upcoming:
                events.length > 0 ? (
                  <EventGrid events={events} />
                ) : (
                  <NothingUpcoming
                    everHadEvents={totalEvents > 0}
                    hasPublishedResults={eventsWithResults > 0}
                    hasPastEvents={counts.past > 0}
                  />
                ),
              past: pastCards.length > 0 ? <PastEvents events={pastCards} /> : <NoPastEvents />,
            }}
          />
        </div>
      </div>
    </>
  );
}
