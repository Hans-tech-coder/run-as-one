import React from 'react';
import Link from 'next/link';
import { CalendarCheck2 } from 'lucide-react';
import { formatEventDay } from '@/lib/event-schedule';

/**
 * The event page's sidebar when it cannot take an entry: the race is over
 * (`RaceIsOver`) or sign-ups are on hold (`RegistrationOnHold`). Split out of
 * `page.tsx`, which was on the split-candidates list.
 */

/**
 * The sidebar of a race that has already been run and whose times are not up.
 *
 * It stands where Register Now stands on a live event, because that is where
 * someone's eye goes and the answer they need is "you cannot enter this one" —
 * not a button that quietly fails, and not a disabled button that says nothing
 * about why. It then tells them the one thing that is still coming.
 *
 * There is no results branch here: the moment an organizer uploads times, the
 * event page redirects to /results and this panel is never reached. A race is
 * either still waiting for its times, which is what this says, or it has
 * moved. A virtual run has no results (lib/event-format.ts), so its panel
 * promises none.
 */
export function RaceIsOver({ event }: { event: { slug: string; date: string; virtualEndDate: string | null } }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-secondary">
          <CalendarCheck2 size={20} />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white m-0">Registration Closed</h2>
      </div>

      <p className="text-sm sm:text-base text-secondary leading-relaxed m-0">
        {event.virtualEndDate
          ? `This virtual run ended on ${formatEventDay(event.virtualEndDate)}.`
          : `This race was held on ${formatEventDay(event.date)}. Official times appear on the results page once the organizer uploads them.`}
      </p>

      <Link
        href="/events"
        className="btn-secondary mt-5 w-full"
      >
        Find Another Race
      </Link>
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
    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-secondary">
          {icon}
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white m-0">{heading}</h2>
      </div>

      <p className="text-sm sm:text-base text-secondary leading-relaxed m-0">
        {message}
      </p>

      <Link
        href="/events"
        className="mt-5 w-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-4 px-6 rounded-[16px] font-bold text-center uppercase tracking-wider flex items-center justify-center gap-2 no-underline"
      >
        Browse Other Races
      </Link>
    </div>
  );
}
