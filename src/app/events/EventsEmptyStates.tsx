import React from 'react';
import Link from 'next/link';
import { Calendar, CalendarCheck2, ChevronRight, History, Trophy } from 'lucide-react';
import { EventsTabLink } from './EventsTabs';

/**
 * What each /events tab shows when it has nothing to list. Split out of
 * page.tsx when the Past tab gave it a second one.
 *
 * The two point at each other (PAST_EVENTS_PLAN.md D6): an empty tab is a
 * normal state now that finished races leave Upcoming, and an empty tab on
 * its own reads as a page that failed to load, so each says what is true and
 * offers the other side when the other side has something — through
 * `EventsTabLink`, so it swaps tabs the way the switch does.
 *
 * Same panel as the /results empty state and the home page's, so all of them
 * read as one surface.
 */

function EmptyPanel({
  icon,
  heading,
  children,
  actions,
}: {
  icon: React.ReactNode;
  heading: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 sm:p-10 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
      <div className="pointer-events-none absolute -mr-32 -mt-32 right-0 top-0 h-[300px] w-[300px] rounded-full bg-accent-blue/10 blur-[80px]" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[20px] border border-accent-blue/20 bg-accent-blue/10 text-accent-blue shadow-[0_0_20px_rgba(0,122,255,0.15)]">
          {icon}
        </div>

        <h2 className="mb-3 text-xl sm:text-2xl font-black uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
          {heading}
        </h2>
        <p className="max-w-md text-base text-secondary leading-relaxed">{children}</p>

        {actions && (
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">{actions}</div>
        )}
      </div>
    </div>
  );
}

/**
 * The Upcoming tab with nothing open for registration.
 *
 * Two different things can be true here, and running them together would be
 * a lie either way: the platform may have no races at all, or every race it
 * has may already have been run — in which case the runner is not stuck, they
 * are one click from the times or from the races themselves.
 */
export function NothingUpcoming({
  everHadEvents,
  hasPublishedResults,
  hasPastEvents,
}: {
  everHadEvents: boolean;
  hasPublishedResults: boolean;
  hasPastEvents: boolean;
}) {
  return (
    <EmptyPanel
      icon={everHadEvents ? <CalendarCheck2 size={30} /> : <Calendar size={30} />}
      heading={everHadEvents ? 'Every Race Has Been Run' : 'No Events Posted Yet'}
      actions={
        // Only offered when there is actually something to read. Sending
        // someone to an empty page, which would send them straight back
        // here, is worse than offering nothing.
        (hasPublishedResults || hasPastEvents) && (
          <>
            {hasPublishedResults && (
              <Link
                href="/results"
                className="btn-gradient w-full sm:w-auto justify-center rounded-[16px] px-8 py-4 text-base text-center group no-underline shadow-xl shadow-accent-orange/20"
              >
                <Trophy size={18} className="shrink-0" />
                <span>View Race Results</span>
                <ChevronRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
            {hasPastEvents && (
              <EventsTabLink view="past" className="btn-secondary w-full sm:w-auto gap-2">
                <History size={18} className="shrink-0" aria-hidden="true" />
                See Past Events
              </EventsTabLink>
            )}
          </>
        )
      }
    >
      {everHadEvents
        ? 'Nothing is open for registration right now. A race moves to Past Events the day after it is held, and its official times go up on Results once the organizer uploads them.'
        : 'Organizers have not published a race yet. Check back soon — this is where new events land first.'}
    </EmptyPanel>
  );
}

/** The Past tab before any race has been held. */
export function NoPastEvents() {
  return (
    <EmptyPanel
      icon={<History size={30} />}
      heading="No Races Held Yet"
      actions={
        <EventsTabLink view="upcoming" className="btn-secondary w-full sm:w-auto gap-2">
          <Calendar size={18} className="shrink-0" aria-hidden="true" />
          See Upcoming Events
        </EventsTabLink>
      }
    >
      Races land here the day after they are run, with their results and photos once the organizer posts them.
    </EmptyPanel>
  );
}
