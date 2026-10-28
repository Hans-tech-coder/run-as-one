'use client';

import React, { Suspense, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import { EventGridEntrance } from '@/components/EventGrid';
import { PAST_EVENTS_HREF, asEventsView, type EventsView } from './events-view';

/**
 * The Upcoming / Past switch at the top of /events (PAST_EVENTS_PLAN.md D1),
 * and the swap of the screen under it.
 *
 * The tab is the URL (`?view=past`): a past list can be shared, the back
 * button returns to the tab it left, and the server renders whichever tab the
 * address asks for. But a tab press is not a navigation. The page renders both
 * tabs in one pass and hands them to `EventsTabSwitch`, which shows one and
 * moves between them with `history.pushState` — Next keeps `useSearchParams`
 * in step with it, back and forward included. A navigation would land in
 * `events/loading.tsx` and blank the list under the running figure on every
 * press; this way the old tab eases out and the new one eases in.
 *
 * The pill behind the active tab slides between them (transitions.dev Tabs
 * sliding, `.t-tabs-pill` in globals.css). Until the script has measured the
 * tabs — the server's HTML, a slow hydration — the active tab paints the same
 * pill on itself, so the switch never shows no tab selected.
 *
 * Both tabs always show with their counts, a zero included, so the switch
 * never jumps.
 */

const TABS: { view: EventsView; label: string }[] = [
  { view: 'upcoming', label: 'Upcoming' },
  { view: 'past', label: 'Past' },
];
const HREF: Record<EventsView, string> = { upcoming: '/events', past: PAST_EVENTS_HREF };

/**
 * Set by `EventsTabSwitch`: moves to a tab without a navigation. Absent in
 * the loading screen, where the tabs are ordinary links.
 */
const SelectTab = createContext<((view: EventsView) => void) | null>(null);

/** A plain left click, which the switch answers itself; anything else (a new tab, a download) stays the browser's. */
function isPlainClick(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * A link to one tab — the switch's own, and the empty states' "See Past
 * Events". Inside the switch a plain click changes tab in place; anywhere
 * else it is an ordinary link.
 */
export function EventsTabLink({
  view,
  className,
  children,
  ...rest
}: { view: EventsView; className?: string; children: React.ReactNode } & Pick<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'aria-current'
>) {
  const select = useContext(SelectTab);
  return (
    <Link
      {...rest}
      href={HREF[view]}
      // Inside the switch both tabs are already on the page, so there is
      // nothing to fetch ahead of a press.
      prefetch={select ? false : undefined}
      onClick={(e) => {
        if (!select || !isPlainClick(e)) return;
        e.preventDefault();
        select(view);
      }}
      className={className}
    >
      {children}
    </Link>
  );
}

export default function EventsTabs({
  view,
  counts,
}: {
  view: EventsView;
  /** Absent while the page loads, when the counts are not known yet. */
  counts?: Record<EventsView, number>;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  // Writes the active tab's box onto the pill. The first placement and every
  // resize (a font arriving, a rotated phone) snap it there with the
  // transition suspended, or it would grow in from the left edge.
  function placePill(animate: boolean) {
    const bar = barRef.current;
    const pill = pillRef.current;
    const tab = bar?.querySelector<HTMLElement>('.t-tab[aria-current="page"]');
    if (!bar || !pill || !tab) return;
    if (!animate) pill.style.transition = 'none';
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = '';
    }
    bar.dataset.ready = '';
  }

  useLayoutEffect(() => {
    placePill(barRef.current?.dataset.ready !== undefined);
  }, [view, counts?.upcoming, counts?.past]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => placePill(false));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Events" className="flex w-full justify-center">
      <div
        ref={barRef}
        className="t-tabs relative inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
      >
        <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
        {TABS.map((tab) => {
          const current = tab.view === view;
          return (
            <EventsTabLink
              key={tab.view}
              view={tab.view}
              aria-current={current ? 'page' : undefined}
              className={`t-tab inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-5 sm:px-7 text-sm font-bold uppercase tracking-wider no-underline ${
                current ? 'text-white' : 'text-secondary hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {tab.label}
              {counts && (
                <span
                  className={`t-tab-count tabular-nums rounded-full px-2 py-0.5 text-xs ${
                    current ? 'bg-accent-orange/20 text-accent-orange' : 'bg-white/[0.06] text-secondary'
                  }`}
                >
                  {counts[tab.view]}
                </span>
              )}
            </EventsTabLink>
          );
        })}
      </div>
    </nav>
  );
}

/** Where a tab swap is: the old tab easing out, the new one placed to ease in, or at rest. */
type SwapPhase = 'idle' | 'exit' | 'enter';

/**
 * A duration token from globals.css, in milliseconds. The build's CSS
 * minifier rewrites `150ms` as `.15s`, so the unit is read rather than assumed.
 */
function tokenMs(name: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const number = parseFloat(value) || 0;
  return value.endsWith('ms') ? number : number * 1000;
}

/**
 * The tabs and what they open, on the page itself. `heading` is the copy
 * above the tabs (absent under a client's hero) and `panels` the list under
 * them, one of each per tab, all rendered by the server; this shows the ones
 * the address asks for.
 *
 * A swap (`.t-tab-panel` in globals.css, transitions.dev Page side-by-side on
 * the shared tokens): the old tab slides a few pixels away from the tab
 * pressed and fades, then the new one comes in from that side. Its cards
 * arrive with the panel rather than one by one, so a swap is one movement;
 * the one-by-one entrance stays for the first load and for Show more. Under
 * reduced motion the new tab simply replaces the old.
 */
export function EventsTabSwitch({
  counts,
  heading,
  panels,
}: {
  counts: Record<EventsView, number>;
  heading?: Record<EventsView, React.ReactNode>;
  panels: Record<EventsView, React.ReactNode>;
}) {
  const view = asEventsView(useSearchParams().get('view'));
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(view);
  const [phase, setPhase] = useState<SwapPhase>('idle');
  const [lastView, setLastView] = useState(view);

  // A new tab in the address — a press, or back and forward — starts a swap.
  // Pressed back before the old tab finished leaving, it just stays.
  if (view !== lastView) {
    setLastView(view);
    if (view === shown) setPhase('idle');
    else if (reduced) {
      setShown(view);
      setPhase('enter');
    } else setPhase('exit');
  }

  useEffect(() => {
    if (phase === 'exit') {
      const timer = setTimeout(() => {
        setShown(view);
        setPhase('enter');
      }, tokenMs('--duration-quick'));
      return () => clearTimeout(timer);
    }
    if (phase === 'enter') {
      // Two frames: the new tab must paint once at its starting offset before
      // the transition back to rest can run.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setPhase('idle'));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
  }, [phase, view]);

  function select(next: EventsView) {
    if (next !== view) window.history.pushState(null, '', HREF[next]);
  }

  const swap = {
    'data-phase': phase,
    // Which way the content moves: toward Past the old tab leaves to the
    // left and the new one comes in from the right, the way the pill travels.
    style: { '--t-tab-dir': view === 'past' ? 1 : -1 } as React.CSSProperties,
  };

  return (
    <SelectTab.Provider value={select}>
      {heading && (
        <div className="t-tab-panel w-full max-w-3xl" {...swap}>
          {heading[shown]}
        </div>
      )}
      <EventsTabs view={view} counts={counts} />
      <EventGridEntrance.Provider value={phase !== 'enter'}>
        <div className="t-tab-panel w-full" {...swap}>
          {panels[shown]}
        </div>
      </EventGridEntrance.Provider>
    </SelectTab.Provider>
  );
}

/**
 * The switch inside `events/loading.tsx`, so arriving at /events shows the
 * tabs above the running figure rather than a bare loader. That boundary
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
