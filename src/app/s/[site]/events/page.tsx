import React from 'react';
import type { Prisma } from '@prisma/client';
import EventGrid from '@/components/EventGrid';
import db, { publishCutoff } from '@/lib/public-db';
import { mostRecentFirst, soonestFirst, upcomingEvents } from '@/lib/event-schedule';
import { publishedEvents } from '@/lib/event-visibility';
import { PAST_CARD, pastEventsWhere, toPastCard } from '@/lib/past-events';
import { forListing } from '@/lib/registration-gate';
import { EVENT_SITE_CLIENT, eventLinkOrigin, getSiteClient } from '@/lib/site-client';
import ClientSiteHero, { hasClientHero } from '@/components/ClientSiteHero';
import { EventsTabSwitch } from './EventsTabs';
import type { EventsView } from './events-view';
import PastEvents from './PastEvents';
import { NoPastEvents, NothingUpcoming } from './EventsEmptyStates';
import PageReveal from '@/components/PageReveal';

/**
 * Cached per site for at most a minute, and dropped by any write — the home
 * page carries the full note (src/app/s/[site]/(home)/page.tsx). The badges
 * judge the clock when the copy is made, so they can be that minute late;
 * checkout never is.
 */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

export default async function EventsPage({ params }: { params: Promise<{ site: string }> }) {
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
  const { site: siteParam } = await params;
  const site = await getSiteClient(siteParam, '/events');
  const linkOrigin = eventLinkOrigin(siteParam);
  // Published events only, counts included: a draft is not something a runner
  // has "missed" (lib/event-visibility.ts).
  const scope = { ...publishedEvents(await publishCutoff()), ...(site ? { clientId: site.id } : {}) };
  // A results-only race is never enterable here, so it is not upcoming in the
  // sense this page means.
  const upcomingWhere: Prisma.EventWhereInput = { ...upcomingEvents(), resultsOnly: false, ...scope };
  // Past (D2): what lib/past-events.ts says, which is also what the home
  // page's Recently Held strip and the links into this tab go by.
  const pastWhere = pastEventsWhere(scope);

  const [upcoming, past, totalEvents, eventsWithResults] = await Promise.all([
    db.event.findMany({
      where: upcomingWhere,
      orderBy: soonestFirst,
      // The slot limits are what decide whether a card is badged FULL;
      // forListing counts against them and then drops them, so nothing about
      // capacity is shipped to the browser.
      // The client only says which host a card links to (lib/site-client.ts).
      include: {
        // `name` is for the card's distance chips only.
        categories: {
          select: { id: true, name: true, slotLimit: true, closed: true, bibMedalOfId: true, opensAt: true },
          orderBy: { sortOrder: 'asc' },
        },
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
  // The distance chips, read before forListing drops the categories; a
  // bib-and-medal variant is a package of a distance already listed.
  const distancesById = new Map(
    upcoming.map((event) => [
      event.id,
      [...new Set(event.categories.filter((c) => !c.bibMedalOfId).map((c) => c.name.trim()))],
    ]),
  );
  const events = (await forListing(upcoming)).map(({ client, ...event }) => ({
    ...event,
    siteOrigin: linkOrigin({ client }),
    distances: distancesById.get(event.id) ?? [],
  }));
  // Each past card goes where its race's answer is (D3).
  const pastCards = past.map((row) => toPastCard(row, linkOrigin));
  const counts = { upcoming: events.length, past: pastCards.length };
  const hero = site && hasClientHero(site) ? site : null;

  // The listing's own heading, per tab. Under a client's hero the hero holds
  // the page's h1, so the listing's heading steps down to an h2.
  const Title = hero ? 'h2' : 'h1';
  const heading = (view: EventsView) => (
    <div>
      <Title className={hero ? 'site-h2' : 'site-h1'}>
        {view === 'past' ? 'Past Races' : 'Upcoming Races'}
      </Title>
      <p className="site-section__sub max-w-[60ch]">
        {view === 'past'
          ? `Every race ${site ? `${site.name} has` : 'we have'} held, newest first, with its results and photos once they are up.`
          : counts.upcoming > 0
            ? `${counts.upcoming} ${counts.upcoming === 1 ? 'race' : 'races'}${site ? ` from ${site.name}` : ''}, soonest first.`
            : site
              ? `Upcoming races from ${site.name}.`
              : 'Every race open on Run As One.'}
      </p>
    </div>
  );

  return (
    <PageReveal>
      <>
        {hero && <ClientSiteHero site={hero} />}
        <section className="site-section site-wrap" aria-label="Races">
          {/* Which tab shows is read from the address by the switch, on the
              server as on the client. */}
          <EventsTabSwitch
            counts={counts}
            heading={{ upcoming: heading('upcoming'), past: heading('past') }}
            panels={{
              upcoming:
                events.length > 0 ? (
                  <EventGrid events={events} eagerCount={4} />
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
        </section>
      </>
    </PageReveal>
  );
}
