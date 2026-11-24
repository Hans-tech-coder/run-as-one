'use client';

import { useSyncExternalStore } from 'react';
import { Hourglass } from 'lucide-react';

/**
 * The closing date beside Register Now, once it is near (`closesSoon`,
 * lib/registration-window.ts). "Closes in 2 days, 4 hours" is a reason to
 * finish today; the bare date is a reason to come back later.
 *
 * The page is a cached static copy, so the count runs here in the browser and
 * the server renders only the date: the first paint is the same everywhere,
 * and the count takes over once the clock is the reader's own. Updated twice a
 * minute, with no live region — a screen reader announcing every tick would
 * drown the page — and no motion.
 */

function left(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (days > 0) return hours > 0 ? `${unit(days, 'day')}, ${unit(hours, 'hour')}` : unit(days, 'day');
  if (hours > 0) return mins > 0 ? `${unit(hours, 'hour')}, ${unit(mins, 'minute')}` : unit(hours, 'hour');
  return mins > 0 ? unit(mins, 'minute') : 'under a minute';
}

const TICK = 30_000;

// The reader's clock as an external store, in 30-second steps so a snapshot is
// stable between renders. The server snapshot is null: the cached page and the
// hydrating browser both draw the date-only line, then the count takes over.
function subscribe(onTick: () => void) {
  const timer = window.setInterval(onTick, TICK);
  return () => window.clearInterval(timer);
}
const clientNow = () => Math.floor(Date.now() / TICK) * TICK;
const serverNow = () => null;

export default function ClosingCountdown({ closesAt, when }: { closesAt: string; when: string }) {
  const now = useSyncExternalStore(subscribe, clientNow, serverNow);

  const remaining = now === null ? null : new Date(closesAt).getTime() - now;
  const heading =
    remaining === null
      ? 'Registration Closes Soon'
      : remaining <= 0
        ? 'Registration Has Closed'
        : `Registration Closes in ${left(remaining)}`;

  return (
    <div className="flex items-start gap-3 rounded-panel border border-site-action px-4 py-3">
      <Hourglass size={18} className="mt-0.5 shrink-0 text-site-accent" aria-hidden="true" />
      <div className="min-w-0">
        <p className="m-0 font-semibold text-site-ink">{heading}</p>
        <p className="m-0 text-sm text-site-muted">
          {remaining !== null && remaining <= 0 ? `Closed ${when}.` : `Deadline: ${when}.`}
        </p>
      </div>
    </div>
  );
}
