import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
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
    <section aria-labelledby="recently-held" className="site-section site-wrap">
      <div className="site-section__head">
        <div>
          <h2 id="recently-held" className="site-h2">Recently held</h2>
          <p className="site-section__sub">The last races run, with their times once they are up.</p>
        </div>
        <Link href={PAST_EVENTS_HREF} className="site-link site-link--arrow shrink-0">
          <span>See all past races</span>
          <LinkPendingIcon>
            <ArrowRight size={18} />
          </LinkPendingIcon>
        </Link>
      </div>

      <EventGrid events={events} action="past" />
    </section>
  );
}
