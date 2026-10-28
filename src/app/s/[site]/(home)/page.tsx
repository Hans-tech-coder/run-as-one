import React from 'react';
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
  const [openForRegistration, totalEvents, recentlyHeld] = await Promise.all([
    db.event.findMany({
      where: upcoming,
      orderBy: soonestFirst,
      take: HOME_EVENT_LIMIT,
      // The slot limits are what decide whether a card is badged FULL;
      // forListing counts against them and then drops them, so nothing about
      // capacity is shipped to the browser.
      // The client only says which host a card links to (lib/site-client.ts).
      include: {
        categories: { select: { id: true, slotLimit: true } },
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
  ]);
  const linkOrigin = eventLinkOrigin(site);

  // A race that is full or paused keeps its place here — it is still upcoming,
  // and this section is the site's front door to it.
  // A client's race links straight to its own site (CLIENT_SUBDOMAIN_PLAN.md).
  const events = (await forListing(openForRegistration)).map(({ client, ...event }) => ({
    ...event,
    siteOrigin: linkOrigin({ client }),
  }));
  const pastCards = recentlyHeld.map((row) => toPastCard(row, linkOrigin));

  return (
    // No overflow-hidden here: the hero's dot arch is full-bleed and runs up
    // under the navbar, and a clipping wrapper would cut it off at the
    // content column.
    <div className="relative w-full flex flex-col items-center">
      <div className="w-full relative z-10 flex flex-col items-center gap-10 sm:gap-20">
        <HeroSection />
        <HomeEventBrowser events={events} totalEvents={totalEvents} />
        {pastCards.length > 0 && <RecentlyHeld events={pastCards} />}
        <HowItWorks />
      </div>
    </div>
  );
}

/**
 * Closes the page off.
 *
 * Without it the last race card ran straight into the footer, which is what
 * made the page trail off rather than end. It sits deliberately quiet — one
 * column of muted rows — so it never competes with the cards above it.
 */
function HowItWorks() {
  const steps = [
    {
      title: 'Pick your race',
      body: 'Browse open events, compare distances or packages, and see exactly what each one includes before you commit.',
    },
    {
      title: 'Register your group',
      body: 'Add every runner in one transaction, choose kit pickup or delivery, and pay by card, e-wallet or bank transfer.',
    },
    {
      title: 'Run, then collect your time',
      body: 'Official results and your e-certificate are published here once the organizer uploads them.',
    },
  ];

  return (
    <section className="w-full max-w-4xl mx-auto pb-4">
      <div className="text-center mb-8 sm:mb-10">
        <span className="text-xs sm:text-sm font-bold tracking-widest uppercase text-accent-orange">
          How It Works
        </span>
        <h2 className="mt-2 text-2xl sm:text-3xl font-black uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
          From Sign-Up To Finish Line
        </h2>
      </div>

      <ol className="flex flex-col gap-3 list-none p-0 m-0">
        {steps.map((step, idx) => (
          <li
            key={step.title}
            className="flex items-start gap-4 rounded-[16px] border border-white/[0.05] bg-black/40 p-4 sm:p-5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
              {idx + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                {step.title}
              </h3>
              <p className="text-sm sm:text-base text-secondary leading-relaxed m-0">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
