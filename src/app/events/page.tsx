import React from 'react';
import Link from 'next/link';
import EventGrid from '@/components/EventGrid';
import db from '@/lib/db';
import { soonestFirst, upcomingEvents } from '@/lib/event-schedule';
import { Calendar, CalendarCheck2, ChevronRight, Trophy } from 'lucide-react';

export default async function EventsPage() {
  // Races that have not been run yet, soonest first — the page is headed
  // "Upcoming Events", and once a race is over it belongs on /results instead.
  // See src/lib/event-schedule.ts for where that line is drawn.
  //
  // The two counts are only for the empty state: an empty listing means
  // something different when the platform has never had a race than when every
  // race it has had is already finished, and the runner deserves to be told
  // which one they are looking at.
  const [events, totalEvents, eventsWithResults] = await Promise.all([
    db.event.findMany({
      where: upcomingEvents(),
      orderBy: soonestFirst,
    }),
    db.event.count(),
    db.event.count({ where: { raceResults: { some: {} } } }),
  ]);

  return (
    <div className="relative overflow-hidden w-full flex flex-col items-center">
      {/* Background Orbs */}
      <div className="absolute -top-[10%] -left-[10%] w-[800px] h-[800px] bg-accent-blue opacity-15 blur-[200px] -z-10 rounded-full" />
      <div className="absolute top-[20%] -right-[10%] w-[600px] h-[600px] bg-accent-orange opacity-15 blur-[200px] -z-10 rounded-full" />
      
      <div className="w-full relative z-10 flex flex-col items-center gap-8 sm:gap-12">
        
        <div className="text-center w-full max-w-3xl mb-0 sm:mb-4 t-stagger is-shown">
          <div className="flex flex-row w-fit mx-auto items-center justify-center gap-2 mb-4 t-stagger-line t-stagger-line--1">
            <Calendar size={20} className="text-accent-blue" />
            <span className="text-sm font-bold tracking-widest uppercase text-accent-orange">Upcoming Events</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 uppercase tracking-tighter leading-tight mb-4 sm:mb-6 t-stagger-line t-stagger-line--2">
            Find Your Next Race
          </h1>
          <p className="text-base sm:text-lg text-secondary leading-relaxed t-stagger-line t-stagger-line--3">
            Browse through all our official marathons, fun runs, and virtual races. Register today and join the community.
          </p>
        </div>

        {events.length > 0 ? (
          <EventGrid events={events} />
        ) : (
          <NothingUpcoming
            everHadEvents={totalEvents > 0}
            hasPublishedResults={eventsWithResults > 0}
          />
        )}
      </div>
    </div>
  );
}

/**
 * What this page shows when nothing is open for registration.
 *
 * Filtering finished races out of the listing made an empty grid a normal
 * state rather than an impossible one, and an empty grid on its own reads as a
 * page that failed to load. Two different things can be true here, and running
 * them together would be a lie either way: the platform may have no races at
 * all, or every race it has may already have been run — in which case the
 * runner is not stuck, they are one click from the times.
 *
 * Same panel as the /results empty state and the home page's, so all three read
 * as one surface.
 */
function NothingUpcoming({
  everHadEvents,
  hasPublishedResults,
}: {
  everHadEvents: boolean;
  hasPublishedResults: boolean;
}) {
  return (
    <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 sm:p-10 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
      <div className="pointer-events-none absolute -mr-32 -mt-32 right-0 top-0 h-[300px] w-[300px] rounded-full bg-accent-blue/10 blur-[80px]" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[20px] border border-accent-blue/20 bg-accent-blue/10 text-accent-blue shadow-[0_0_20px_rgba(0,122,255,0.15)]">
          {everHadEvents ? <CalendarCheck2 size={30} /> : <Calendar size={30} />}
        </div>

        <h2 className="mb-3 text-xl sm:text-2xl font-black uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
          {everHadEvents ? 'Every Race Has Been Run' : 'No Events Posted Yet'}
        </h2>
        <p className="max-w-md text-base text-secondary leading-relaxed">
          {everHadEvents
            ? 'Nothing is open for registration right now. A race leaves this page the day after it is held, and its official times go up on Results once the organizer uploads them.'
            : 'Organizers have not published a race yet. Check back soon — this is where new events land first.'}
        </p>

        {/* Only offered when there is actually something to read. Sending
            someone to an empty Results page, which would send them straight
            back here, is worse than offering nothing. */}
        {hasPublishedResults && (
          <Link
            href="/results"
            className="btn-gradient mt-8 w-full sm:w-auto justify-center rounded-[16px] px-8 py-4 text-base text-center group no-underline shadow-xl shadow-accent-orange/20"
          >
            <Trophy size={18} className="shrink-0" />
            <span>View Race Results</span>
            <ChevronRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>
    </div>
  );
}
