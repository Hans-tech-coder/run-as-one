import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, Globe, MapPin } from 'lucide-react';
import { formatEventRange, formatEventTime, formatEventWeekdayShort } from '@/lib/event-schedule';
import { VIRTUAL_RUN_WHERE, isVirtual } from '@/lib/event-format';

/**
 * A race's name and its when and where, at the top of every page about one
 * race — the event page and the three results pages (the Paper redesign,
 * docs/conventions.md §9).
 *
 * It replaced EventHeroBanner, a full-bleed banner that printed the title in
 * white capitals over the organizer's own poster behind a dark scrim. The
 * poster already says the race's name in its own lettering, so the page says
 * it once, in type, and the event page shows the poster whole beneath.
 *
 * `back` is the one step up (All races, the winners board, the leaderboard);
 * `title` overrides the heading when the page is about something inside the
 * race (Race winners), with the race's name moving to the line above it.
 */
export default function RaceHeader({
  event,
  back,
  title,
  children,
}: {
  event: {
    title: string;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    location: string;
    format?: string | null;
    virtualEndDate?: string | null;
  };
  back: { href: string; label: string };
  title?: string;
  /** Actions under the facts (the leaderboard link, photo albums). */
  children?: React.ReactNode;
}) {
  const virtual = isVirtual(event);
  const times = [event.startTime, event.endTime]
    .filter((t): t is string => Boolean(t))
    .map(formatEventTime);
  return (
    <header className="pt-6 pb-6 md:pt-10 md:pb-8" data-enter>
      <Link href={back.href} className="site-link mb-2 text-[0.9375rem] text-site-muted">
        <ArrowLeft size={16} aria-hidden="true" />
        <span>{back.label}</span>
      </Link>
      {title && <p className="m-0 mb-1 text-base font-semibold text-site-accent break-words">{event.title}</p>}
      <h1 className="site-h1 max-w-[22ch] break-words">{title ?? event.title}</h1>
      <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-base text-site-muted md:text-lg">
        <li className="flex items-center gap-2">
          <Calendar size={18} className="shrink-0 text-site-accent" aria-hidden="true" />
          {virtual ? formatEventRange(event.date, event.virtualEndDate ?? null) : formatEventWeekdayShort(event.date)}
        </li>
        {!virtual && times.length > 0 && (
          <li className="flex items-center gap-2">
            <Clock size={18} className="shrink-0 text-site-accent" aria-hidden="true" />
            {times.join(' – ')}
          </li>
        )}
        <li className="flex min-w-0 items-center gap-2">
          {virtual ? (
            <Globe size={18} className="shrink-0 text-site-accent" aria-hidden="true" />
          ) : (
            <MapPin size={18} className="shrink-0 text-site-accent" aria-hidden="true" />
          )}
          <span className="min-w-0 break-words">{virtual ? VIRTUAL_RUN_WHERE : event.location}</span>
        </li>
      </ul>
      {children && <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>}
    </header>
  );
}
