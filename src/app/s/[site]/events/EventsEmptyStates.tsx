import React from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar, CalendarCheck2, History, Trophy } from 'lucide-react';
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
    <div className="w-full rounded-[14px] border border-site-line bg-site-card px-6 py-10 text-center sm:px-10">
      <div className="flex flex-col items-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-site-surface text-site-ink" aria-hidden="true">
          {icon}
        </div>

        <h2 className="site-h3 mb-2">{heading}</h2>
        <p className="site-lead max-w-md">{children}</p>

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
      icon={everHadEvents ? <CalendarCheck2 size={22} /> : <Calendar size={22} />}
      heading={everHadEvents ? 'Every Race Has Been Run' : 'No Races Posted Yet'}
      actions={
        // Only offered when there is actually something to read. Sending
        // someone to an empty page, which would send them straight back
        // here, is worse than offering nothing.
        (hasPublishedResults || hasPastEvents) && (
          <>
            {hasPublishedResults && (
              <Link href="/results" className="site-btn site-btn--action group w-full sm:w-auto">
                <Trophy size={18} className="shrink-0" aria-hidden="true" />
                <span>See Race Results</span>
                <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            )}
            {hasPastEvents && (
              <EventsTabLink view="past" className="site-btn site-btn--quiet w-full sm:w-auto">
                <History size={18} className="shrink-0" aria-hidden="true" />
                See Past Races
              </EventsTabLink>
            )}
          </>
        )
      }
    >
      {everHadEvents
        ? 'Nothing is open for registration right now. A race moves to Past races the day after it is held, and its official times go up on Results once the organizer uploads them.'
        : 'Organizers have not published a race yet. New races show up here first.'}
    </EmptyPanel>
  );
}

/** The Past tab before any race has been held. */
export function NoPastEvents() {
  return (
    <EmptyPanel
      icon={<History size={22} />}
      heading="No Races Held Yet"
      actions={
        <EventsTabLink view="upcoming" className="site-btn site-btn--quiet w-full sm:w-auto">
          <Calendar size={18} className="shrink-0" aria-hidden="true" />
          See Upcoming Races
        </EventsTabLink>
      }
    >
      Races land here the day after they are run, with their results and photos once the organizer posts them.
    </EmptyPanel>
  );
}
