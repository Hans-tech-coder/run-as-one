import React from 'react';
import Link from 'next/link';
import HeroSection from '@/components/HeroSection';
import HomeEventBrowser from '@/components/HomeEventBrowser';
import db, { publishCutoff } from '@/lib/public-db';
import { mostRecentFirst, soonestFirst, upcomingEvents } from '@/lib/event-schedule';
import { publishedEvents } from '@/lib/event-visibility';
import { PAST_CARD, pastEventsWhere, toPastCard } from '@/lib/past-events';
import { forListing } from '@/lib/registration-gate';
import { EVENT_SITE_CLIENT, eventLinkOrigin } from '@/lib/site-client';
import RecentlyHeld from './RecentlyHeld';

const HOME_EVENT_LIMIT = 6;
/** One row of cards on a desktop grid: a glance back, not a second listing. */
const RECENTLY_HELD_LIMIT = 3;

/**
 * Rendered once per site, then served from Next's cache (ISR,
 * PUBLIC_PAGE_CACHE_PLAN.md), never at build time.
 *
 * Every word this listing says about a race is a live answer: whether the
 * organizer has a hold on sign-ups, whether an opening date has arrived,
 * whether the last slot has gone, and whether the race has already been run.
 * A build-time prerender would freeze all four at the last deploy, and the
 * clock is the worse half of that — `upcomingEvents()` here and `opensLater()`
 * inside `forListing` both compare against `new Date()`, so it would keep a
 * finished race in the grid and go on promising "Opens Sep 15" for weeks
 * after sign-ups opened. (It cost us a live one: this page badged a race
 * Paused that its organizer had already scheduled minutes earlier.)
 *
 * So the cached copy lives at most `revalidate` seconds, the owner's D1: a
 * clock-made change (a schedule going live, sign-ups opening, a promo ending)
 * shows up to a minute late. Checkout judges the clock itself, so only the
 * badge lags, never the sale. Any write expires the copy at once: the rows
 * are read under `PUBLIC_DATA_TAG` (lib/public-db.ts), which the page carries
 * too. `generateStaticParams` returning nothing is what makes a page cached on
 * its first visit instead of rendered on every one. The other pages under
 * `s/[site]` follow this note.
 */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

export default async function Home({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  // Two rows of cards on a desktop grid rather than one, so the section that
  // the page exists for looks like a listing instead of a leftover. The count
  // decides whether a "view all" link is worth showing at all.
  //
  // Upcoming races only, soonest first: this section is headed "Open For
  // Registration", and a race that has already been run is neither. Finished
  // races move to /results — see src/lib/event-schedule.ts.
  // Results-only races are left out: their sign-ups run elsewhere, so they
  // are not open for registration in any sense this section means. Drafts and
  // scheduled events are not public yet (lib/event-visibility.ts).
  //
  // Below them, the last few races already run (PAST_EVENTS_PLAN.md §3), by
  // the Past tab's own rule (lib/past-events.ts) and read in the same pass,
  // so the strip costs no wake-up of its own. Never scoped to a client: on a
  // client's site `/` is redirected to its /events (src/proxy.ts), so this
  // page only ever renders on the main host, where /events is unscoped too.
  const published = publishedEvents(await publishCutoff());
  const upcoming = { ...upcomingEvents(), ...published, resultsOnly: false };
  // The provinces the upcoming races are in, most races first, are the hero's
  // headline ("Road races in Tarlac and Pangasinan"), so it stays true as the
  // calendar moves without anyone editing copy. Read in the same pass.
  const [openForRegistration, totalEvents, recentlyHeld, byProvince] = await Promise.all([
    db.event.findMany({
      where: upcoming,
      orderBy: soonestFirst,
      take: HOME_EVENT_LIMIT,
      // The slot limits are what decide whether a card is badged FULL;
      // forListing counts against them and then drops them, so nothing about
      // capacity is shipped to the browser.
      // The client only says which host a card links to (lib/site-client.ts).
      include: {
        // `name` and `sortOrder` are for the card's distance chips only.
        categories: {
          select: { id: true, name: true, slotLimit: true, closed: true, bibMedalOfId: true, opensAt: true },
          orderBy: { sortOrder: 'asc' },
        },
        client: EVENT_SITE_CLIENT,
      },
    }),
    db.event.count({ where: upcoming }),
    db.event.findMany({
      where: pastEventsWhere(published),
      orderBy: mostRecentFirst,
      take: RECENTLY_HELD_LIMIT,
      select: PAST_CARD,
    }),
    db.event.groupBy({
      by: ['province'],
      where: { ...upcoming, format: 'ONSITE', province: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const provinces = byProvince
    .filter((row): row is typeof row & { province: string } => Boolean(row.province?.trim()))
    .sort((a, b) => b._count._all - a._count._all || a.province.localeCompare(b.province))
    .map((row) => row.province.trim());
  const linkOrigin = eventLinkOrigin(site);

  // A race that is full or paused keeps its place here — it is still upcoming,
  // and this section is the site's front door to it.
  // A client's race links straight to its own site (CLIENT_SUBDOMAIN_PLAN.md).
  // The distance chips are read before forListing drops the categories. A
  // bib-and-medal variant (bibMedalOfId) is a package of a distance already
  // listed, so it is not a distance of its own.
  const distancesById = new Map(
    openForRegistration.map((event) => [
      event.id,
      [...new Set(event.categories.filter((c) => !c.bibMedalOfId).map((c) => c.name.trim()))],
    ]),
  );
  const events = (await forListing(openForRegistration)).map(({ client, ...event }) => ({
    ...event,
    siteOrigin: linkOrigin({ client }),
    distances: distancesById.get(event.id) ?? [],
  }));
  const pastCards = recentlyHeld.map((row) => toPastCard(row, linkOrigin));

  return (
    <div className="w-full">
      <HeroSection provinces={provinces} nextRace={events[0] ?? null} />
      <HomeEventBrowser events={events} totalEvents={totalEvents} />
      {pastCards.length > 0 && <RecentlyHeld events={pastCards} />}
      <OrganizerBand />
    </div>
  );
}

/**
 * Closes the page off, for the other people who land here: organizers.
 *
 * It replaced three numbered "How it works" cards, which restated what the
 * hero already says and were one of the template tells the audit caught. The
 * one thing the page did not yet say is that a race can be handed to Run As
 * One, so this says that, framed as hiring (clients hire Run As One; they do
 * not partner with it), and goes to Our Services.
 *
 * The home page only renders on the main host — a client's `/` is redirected
 * to its /events (src/proxy.ts) — so this never shows on a client's site.
 */
function OrganizerBand() {
  return (
    <section className="site-wrap pb-14 md:pb-20" aria-labelledby="organizers">
      <div className="grid grid-cols-1 gap-6 rounded-[14px] bg-site-surface px-6 py-8 sm:px-10 sm:py-10 md:grid-cols-12 md:items-center md:gap-8">
        <div className="md:col-span-8">
          <h2 id="organizers" className="site-h2">Organizing a race?</h2>
          <p className="site-lead mt-3 max-w-[56ch]">
            Hire Run As One to take your sign-ups and payments online, release
            race kits, and publish results and e-certificates after the race.
          </p>
        </div>
        <div className="md:col-span-4 md:justify-self-end">
          <Link href="/admin/register" className="site-btn site-btn--quiet site-btn--block-sm">
            See our services
          </Link>
        </div>
      </div>
    </section>
  );
}
