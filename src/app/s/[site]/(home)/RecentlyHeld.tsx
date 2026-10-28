import React from 'react';
import Link from 'next/link';
import { ChevronRight, History } from 'lucide-react';
import EventGrid from '@/components/EventGrid';
import LinkPendingIcon from '@/components/ui/LinkPendingIcon';
import { PAST_EVENTS_HREF } from '../events/events-view';

/**
 * The home page's look back (PAST_EVENTS_PLAN.md §3): the last few races
 * already run, under the races still open, with the way into the Past tab.
 *
 * It sits below the upcoming browser and never above it — the home page
 * exists to showcase races a runner can still enter (PROJECT_GUIDE.md §8
 * rule 5), and this is the proof that they get run. Same cards as the Past
 * tab, so a race looks like itself on both, and the same header as the
 * section above it, so the two read as one page rather than two. The page
 * leaves it out when nothing has been held.
 */
export default function RecentlyHeld({ events }: { events: React.ComponentProps<typeof EventGrid>['events'] }) {
  return (
    <section aria-labelledby="recently-held" className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <div className="flex flex-row items-center gap-2 mb-2">
            <History size={18} className="text-accent-blue" aria-hidden="true" />
            <span className="text-xs sm:text-sm font-bold tracking-widest uppercase text-accent-orange">
              Recently Held
            </span>
          </div>
          <h2 id="recently-held" className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white m-0">
            Races Already Run
          </h2>
        </div>

        <Link
          href={PAST_EVENTS_HREF}
          className="group bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/30 transition-all py-2.5 px-4 rounded-[16px] font-bold text-sm tracking-wide flex items-center gap-1 shrink-0 no-underline"
        >
          See all past events
          <LinkPendingIcon>
            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform inline-block" />
          </LinkPendingIcon>
        </Link>
      </div>

      <EventGrid events={events} action="past" />
    </section>
  );
}
