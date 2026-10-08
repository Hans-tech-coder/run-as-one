'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** How many past races show at first, and how many each "Show more" adds: one
 *  even run of cards at three columns, two or one. */
export const PAST_PAGE_SIZE = 6;

/**
 * A client viewer's past races, six at a time (`ViewerDashboard`, the Past
 * events fold). The cards are rendered on the server and handed in whole; this
 * only decides how many are shown, so "Show more" is instant and does not
 * redraw the page's loading skeleton the way a new URL would.
 *
 * After more appear, focus moves to the first new card's link, so a keyboard
 * user lands on what they asked for rather than on a button that moved.
 */
export default function PastEventsGrid({ cards }: { cards: React.ReactNode[] }) {
  const [shown, setShown] = useState(PAST_PAGE_SIZE);
  const listRef = useRef<HTMLUListElement>(null);
  const left = cards.length - shown;
  const next = Math.min(PAST_PAGE_SIZE, left);

  function showMore() {
    const firstNew = shown;
    setShown(shown + PAST_PAGE_SIZE);
    requestAnimationFrame(() => {
      listRef.current?.children[firstNew]?.querySelector<HTMLElement>('.viewer-event-open')?.focus();
    });
  }

  return (
    <>
      <ul ref={listRef} className="viewer-event-grid" aria-label="Past events">
        {cards.slice(0, shown).map((card, i) => (
          <li key={i}>{card}</li>
        ))}
      </ul>

      {left > 0 && (
        <button type="button" className="viewer-show-more" onClick={showMore}>
          Show {next} more past {next === 1 ? 'event' : 'events'}
          <span className="viewer-show-more-left">{left} left</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
