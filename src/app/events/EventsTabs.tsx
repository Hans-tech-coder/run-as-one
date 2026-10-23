'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { asEventsView, type EventsView } from './events-view';

/**
 * The Upcoming / Past switch at the top of /events (PAST_EVENTS_PLAN.md D1).
 *
 * Two plain links rather than buttons over client state: the tab is the URL
 * (`?view=past`), read by the page on the server, so a past list can be
 * shared and the back button returns to the tab it left. Both tabs always
 * show with their counts, a zero included, so the switch never jumps.
 *
 * No sliding indicator: a tab change is a navigation that renders the page
 * again, so there is no mounted switch for an indicator to slide inside.
 */

const TABS: { view: EventsView; label: string; href: string }[] = [
  { view: 'upcoming', label: 'Upcoming', href: '/events' },
  { view: 'past', label: 'Past', href: '/events?view=past' },
];

export default function EventsTabs({
  view,
  counts,
}: {
  view: EventsView;
  /** Absent while the page loads, when the counts are not known yet. */
  counts?: Record<EventsView, number>;
}) {
  return (
    <nav aria-label="Events" className="flex w-full justify-center">
      <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        {TABS.map((tab) => {
          const current = tab.view === view;
          return (
            <Link
              key={tab.view}
              href={tab.href}
              aria-current={current ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-5 sm:px-7 text-sm font-bold uppercase tracking-wider no-underline transition-colors ${
                current
                  ? 'bg-white/[0.12] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]'
                  : 'text-secondary hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {tab.label}
              {counts && (
                <span
                  className={`tabular-nums rounded-full px-2 py-0.5 text-xs ${
                    current ? 'bg-accent-orange/20 text-accent-orange' : 'bg-white/[0.06] text-secondary'
                  }`}
                >
                  {counts[tab.view]}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The switch inside `events/loading.tsx`, so a tab change keeps the tabs on
 * screen under the running figure instead of blanking them. That boundary
 * also covers arriving at one race's page, where a tab row would be wrong,
 * so it draws only while the address being loaded is /events itself.
 */
export function EventsTabsWhileLoading() {
  return (
    <Suspense fallback={null}>
      <LoadingTabs />
    </Suspense>
  );
}

function LoadingTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname !== '/events') return null;
  return (
    <div className="w-full pt-2">
      <EventsTabs view={asEventsView(params.get('view'))} />
    </div>
  );
}
