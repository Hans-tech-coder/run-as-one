'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import EventGrid from '@/components/EventGrid';

/** How many past races show at first, and how many each "Show more" adds (D4). */
export const PAST_PAGE_SIZE = 12;

type PastCard = React.ComponentProps<typeof EventGrid>['events'][number];

/**
 * The Past tab's list (PAST_EVENTS_PLAN.md D4): newest first as the page
 * ordered it, a year heading between groups, twelve at a time.
 *
 * Every card is queried and rendered by the page in one pass; this only
 * decides how many show, so "Show more" is instant and does not redraw the
 * route's loading screen the way a new URL would — the same pattern as the
 * client viewer's Past events fold (admin/PastEventsGrid.tsx). After more
 * appear, focus moves to the first new card's button, so a keyboard user
 * lands on what they asked for rather than on a button that moved.
 */
export default function PastEvents({ events }: { events: PastCard[] }) {
  const [shown, setShown] = useState(PAST_PAGE_SIZE);
  const [staggerFrom, setStaggerFrom] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const left = events.length - shown;

  const groups: { year: string; offset: number; events: PastCard[] }[] = [];
  events.slice(0, shown).forEach((event, index) => {
    const year = event.date.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last?.year === year) last.events.push(event);
    else groups.push({ year, offset: index, events: [event] });
  });

  function showMore() {
    const firstNew = shown;
    setStaggerFrom(firstNew);
    setShown(shown + PAST_PAGE_SIZE);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelectorAll('[data-event-card]')
        [firstNew]?.querySelector<HTMLElement>('a')
        ?.focus();
    });
  }

  return (
    <div ref={listRef} className="flex w-full flex-col gap-10 sm:gap-14">
      {groups.map((group) => (
        <section key={group.year} aria-labelledby={`past-${group.year}`} className="flex w-full flex-col gap-5 sm:gap-6">
          <div className="flex items-center gap-4">
            <h2 id={`past-${group.year}`} className="m-0 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-white">
              {group.year}
            </h2>
            <div className="h-px flex-1 bg-white/10" aria-hidden="true" />
          </div>
          <EventGrid
            events={group.events}
            action="past"
            staggerFrom={Math.max(0, staggerFrom - group.offset)}
          />
        </section>
      ))}

      {left > 0 && (
        <button type="button" onClick={showMore} className="btn-secondary mx-auto w-full sm:w-auto gap-2">
          Show more past events
          <span className="font-semibold text-secondary normal-case tracking-normal">· {left} left</span>
          <ChevronDown size={18} aria-hidden="true" className="shrink-0" />
        </button>
      )}
    </div>
  );
}
