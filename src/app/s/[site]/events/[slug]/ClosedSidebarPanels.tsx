import React from 'react';
import Link from 'next/link';
import { CalendarCheck2 } from 'lucide-react';
import RacePhotoLinks from '@/components/RacePhotoLinks';
import { formatEventDay } from '@/lib/event-schedule';
import { awaitingResults } from '@/lib/event-format';

/**
 * The event page's sidebar when it cannot take an entry: the race is over
 * (`RaceIsOver`) or sign-ups are on hold (`RegistrationOnHold`). Split out of
 * `page.tsx`, which was on the split-candidates list.
 *
 * The rule `RaceIsOver` owns (PAST_EVENTS_PLAN.md D5): a finished race
 * promises official times only while `awaitingResults` says so — a timed race
 * (`isTimed`, lib/event-format.ts) in the first 14 days after race day. A fun
 * run with no timing, a virtual run, and a timed race whose times never came
 * say when they were held and nothing more.
 */

/**
 * The sidebar of a race that has already been run and whose times are not up.
 *
 * It stands where Register Now stands on a live event, because that is where
 * someone's eye goes and the answer they need is "you cannot enter this one" —
 * not a button that quietly fails, and not a disabled button that says nothing
 * about why. It then tells them what is still coming, if anything is.
 *
 * There is no results branch here: the moment an organizer uploads times, the
 * event page redirects to /results and this panel is never reached. What is
 * left is when the race was held, the promise of times only while it is still
 * fair to make (D5), the organizer's photo albums when there are any, and the
 * way back to the other races held — this page is reached from the Past tab
 * as often as from a saved link.
 */
export function RaceIsOver({
  event,
}: {
  event: Parameters<typeof awaitingResults>[0] & {
    slug: string;
    virtualEndDate: string | null;
    /** The stored JSON as it comes; RacePhotoLinks cleans it. */
    photoAlbums?: unknown;
  };
}) {
  return (
    <div className="rounded-[14px] border border-site-line bg-site-card p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-site-surface text-site-ink">
          <CalendarCheck2 size={20} />
        </div>
        <h2 className="site-h3 text-xl">Registration Closed</h2>
      </div>

      <p className="m-0 text-[0.9375rem] leading-relaxed text-site-muted">
        {event.virtualEndDate
          ? `This virtual run ended on ${formatEventDay(event.virtualEndDate)}.`
          : `This race was held on ${formatEventDay(event.date)}.`}
        {awaitingResults(event) &&
          ' Official times appear on the results page once the organizer uploads them.'}
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <RacePhotoLinks albums={event.photoAlbums} />
        <Link href="/events?view=past" className="site-btn site-btn--quiet w-full">
          Back to Past Races
        </Link>
        <Link href="/events" className="site-btn site-btn--quiet w-full">
          Find Another Race
        </Link>
      </div>
    </div>
  );
}

/**
 * The sidebar of a race that is still ahead but is not taking entries — the
 * organizer paused sign-ups, sign-ups have not opened yet, or every option has
 * sold out.
 *
 * Same panel as RaceIsOver, standing in the same place, for the same reason:
 * the answer belongs where the eye already goes, and a disabled Register button
 * explains nothing. What differs is that this one is temporary, so it does not
 * send the runner away — the categories, the inclusions and the race kit above
 * it are all still worth reading, and a hold can lift.
 */
export function RegistrationOnHold({
  icon,
  heading,
  message,
}: {
  icon: React.ReactNode;
  heading: string;
  message: string;
}) {
  return (
    <div className="rounded-[14px] border border-site-line bg-site-card p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-site-surface text-site-ink">
          {icon}
        </div>
        <h2 className="site-h3 text-xl">{heading}</h2>
      </div>

      <p className="m-0 text-[0.9375rem] leading-relaxed text-site-muted">
        {message}
      </p>

      <Link
        href="/events"
        className="site-btn site-btn--quiet mt-5 w-full"
      >
        Browse Other Races
      </Link>
    </div>
  );
}
