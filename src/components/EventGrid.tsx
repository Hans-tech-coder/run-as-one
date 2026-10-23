"use client";

import React, { createContext, useContext } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, Camera, MapPin, ChevronRight, Globe } from 'lucide-react';
import EventImage from './EventImage';
import LinkPendingIcon from './ui/LinkPendingIcon';
import { formatEventDayShort, formatEventInstantShort, formatEventRange } from '@/lib/event-schedule';
import { VIRTUAL_RUN_WHERE, isVirtual } from '@/lib/event-format';

// Using a type that matches the Prisma Event model payload
type DBEvent = {
  id: string;
  /** What the card links to — see src/lib/event-slug.ts. */
  slug: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
  /** ONSITE or VIRTUAL; a virtual run prints its window instead of a day and venue. */
  format?: string;
  virtualEndDate?: string | null;
  /**
   * Set by `forListing` in lib/registration-gate.ts when this race cannot be
   * signed up for: every option sold out, the organizer paused it, or sign-ups
   * have not opened yet. Absent on /results, where every event is finished and
   * the card offers times instead.
   */
  registrationClosed?: 'CLOSED' | 'PAUSED' | 'SCHEDULED' | 'FULL' | null;
  /**
   * When sign-ups start, for a SCHEDULED card. It is the one closure a runner
   * can act on — the other two leave them nothing to do but check back — so
   * the chip spends its width on the date rather than on the word "scheduled".
   */
  registrationOpensAt?: string | Date | null;
  /**
   * The origin of the site this event's pages live on, when that is not the
   * host showing the card; '' or absent keeps the link relative. Set by
   * `eventLinkOrigin` (lib/site-client.ts), so a client's race opens straight
   * on the client's subdomain instead of through a redirect.
   */
  siteOrigin?: string;
  /**
   * Past cards only (`action="past"`), worked out by the page that queried
   * them (PAST_EVENTS_PLAN.md D3): whether times are up, whether a timed race
   * is still inside the window in which it promises them (`awaitingResults`),
   * and whether the organizer posted any photo album, which earns the card a
   * camera chip.
   */
  hasResults?: boolean;
  resultsSoon?: boolean;
  hasPhotos?: boolean;
}

/**
 * What the card's button does. The public listings show the same event at
 * points in its life — open for registration on /events, already run on
 * /results — so they share one card and differ only in where it sends you. A
 * plain string rather than a callback because the pages rendering this client
 * component are Server Components, and a function cannot cross that boundary.
 *
 * `past` is the Past tab on /events, where one grid holds races at different
 * points after race day, so it picks per card (`pastCard`) instead of one
 * destination for all.
 */
export type EventCardAction = 'register' | 'results' | 'past';

const ACTIONS: Record<Exclude<EventCardAction, 'past'>, { label: string; path: (slug: string) => string }> = {
  register: { label: 'Register Now', path: (slug) => `/events/${slug}` },
  results: { label: 'View Results', path: (slug) => `/results/${slug}` },
};

/** "Oct 5" — a past card sits under its year's heading, so the year is said once there. */
function dayInYear(date: string): string {
  return formatEventDayShort(date).replace(/,\s*\d{4}$/, '');
}

/**
 * Where a past card goes and what its chip says (D3): each race to where its
 * answer is. Times up → the ranking. A virtual run says when its window
 * ended; a timed race still inside its window says times are coming; any
 * other says when it was held, which is all that is left to say.
 */
function pastCard(event: DBEvent): { badge: string; quiet: boolean; label: string; path: (slug: string) => string } {
  if (event.hasResults) return { badge: 'Results', quiet: false, ...ACTIONS.results };
  const view = { quiet: true, label: 'View Event', path: ACTIONS.register.path };
  if (isVirtual(event)) return { badge: `Ended ${dayInYear(event.virtualEndDate ?? event.date)}`, ...view };
  if (event.resultsSoon) return { badge: 'Results Soon', ...view };
  return { badge: `Held ${dayInYear(event.date)}`, ...view };
}

/** The corner chip, and the word the button uses instead of "Register Now". */
const CLOSURES = {
  CLOSED: { badge: 'Closed', label: 'View Event' },
  FULL: { badge: 'Full', label: 'View Event' },
  PAUSED: { badge: 'Paused', label: 'View Event' },
  // Overwritten with the date below when the card has one. The bare word is
  // the fallback for a row whose instant will not parse, which should not
  // happen and must still say something true if it does.
  SCHEDULED: { badge: 'Opens Soon', label: 'View Event' },
} as const;

function EventCard({ event, action }: { event: DBEvent; action: EventCardAction }) {
  const past = action === 'past' ? pastCard(event) : null;
  const { label, path } = past ?? ACTIONS[action as Exclude<EventCardAction, 'past'>];
  const href = `${event.siteOrigin ?? ''}${path(event.slug)}`;
  // A race nobody can enter still links to its own page: that page is where
  // the reason lives, and the categories, inclusions and race kit are all
  // still worth reading. What changes is that the card stops promising a
  // sign-up it cannot deliver — the button drops the gradient it shares with
  // every live card and says what it actually does.
  const closure =
    action === 'register' && event.registrationClosed
      ? CLOSURES[event.registrationClosed]
      : null;

  // "Opens Sep 20" rather than "Opens Soon": a runner scanning the grid can
  // decide from the chip alone whether this race is worth a click today, and
  // a date is the one thing that tells them.
  const opensOn =
    event.registrationClosed === 'SCHEDULED' && event.registrationOpensAt
      ? formatEventInstantShort(event.registrationOpensAt)
      : '';
  const badge = past ? past.badge : opensOn ? `Opens ${opensOn}` : closure?.badge;
  // The quiet button: on a closed card and on a past one that only opens its
  // event page, so the gradient stays the mark of a card that leads somewhere new.
  const quietLabel = past ? (past.quiet ? past.label : null) : closure?.label ?? null;

  return (
    <div className="relative flex flex-col overflow-hidden rounded-[20px] border border-white/5 aspect-[4/5] transition-all duration-300 cursor-pointer hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)] group">
      <div className="absolute inset-0 z-10">
        <EventImage src={event.imageUrl} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" iconSize={48} />
        <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#0f0f14]/95 via-[#0f0f14]/70 to-[#0f0f14]/10"></div>
      </div>
      {/* Over the image rather than down beside the title, so a runner
          scanning a grid of six reads it without reading anything else. */}
      {/* Left of the status chip, so both fit on the narrowest card. A sign
          rather than a link: the albums open from the race's own page. */}
      {past && event.hasPhotos && (
        <span className="absolute left-4 top-4 z-30 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-sm">
          <Camera size={14} aria-hidden="true" className="shrink-0" />
          Photos
        </span>
      )}
      {badge && (
        <span className="absolute right-4 top-4 z-30 whitespace-nowrap rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-sm">
          {badge}
        </span>
      )}
      <div className="relative z-30 flex flex-col justify-end h-full p-5 sm:p-8">
        <h2 className="font-sans text-2xl sm:text-3xl font-bold uppercase mb-4 leading-tight text-white tracking-tight">
          {event.title}
        </h2>
        <div className="flex flex-col gap-2 mb-6">
          {/* A virtual run keeps the on-site card's two rows — when, then
              where — so its window gets the calendar icon like any race day,
              and the globe stands for the place it is run instead of a venue. */}
          {isVirtual(event) ? (
            <>
              <div className="flex items-center gap-3 text-white/80 font-body text-sm sm:text-base">
                <Calendar size={18} className="shrink-0" />
                <span className="whitespace-nowrap">{formatEventRange(event.date, event.virtualEndDate ?? null)}</span>
              </div>
              <div className="flex items-center gap-3 text-white/80 font-body text-sm sm:text-base">
                <Globe size={18} className="shrink-0" /> <span>{VIRTUAL_RUN_WHERE}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 text-white/80 font-body text-sm sm:text-base">
                <Calendar size={18} /> <span>{formatEventDayShort(event.date)}</span>
              </div>
              <div className="flex items-center gap-3 text-white/80 font-body text-sm sm:text-base">
                <MapPin size={18} /> <span>{event.location}</span>
              </div>
            </>
          )}
        </div>
        {quietLabel ? (
          <Link href={href} className="w-full flex items-center justify-center gap-2 py-4 text-base sm:text-lg rounded-[16px] border border-white/15 bg-white/[0.06] font-bold uppercase tracking-wider text-white no-underline transition-colors hover:border-white/30 hover:bg-white/10 group">
            {quietLabel}{' '}
            <LinkPendingIcon>
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform inline-block" />
            </LinkPendingIcon>
          </Link>
        ) : (
          <Link href={href} className="btn-gradient w-full py-4 text-base sm:text-lg rounded-[16px] group shadow-xl shadow-accent-orange/20 no-underline">
            {label}{' '}
            <LinkPendingIcon className="ml-1">
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform inline-block" />
            </LinkPendingIcon>
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Whether cards mounting now rise in one by one. True everywhere but a tab
 * swap on /events (EventsTabSwitch), where the whole list eases in as one
 * panel and a card-by-card entrance on top of it would read as a second,
 * slower arrival. Only read on a card's mount, so cards that a later
 * "Show more" adds still rise in.
 */
export const EventGridEntrance = createContext(true);

export default function EventGrid({
  events,
  action = 'register',
  staggerFrom = 0,
}: {
  events: DBEvent[];
  action?: EventCardAction;
  /**
   * The first card whose entrance is staggered from zero. Cards before it are
   * already on screen; after a "Show more" the new ones should not wait out a
   * delay counted from the top of the list.
   */
  staggerFrom?: number;
}) {
  const entrance = useContext(EventGridEntrance);
  return (
    <section className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 w-full">
        {events.map((event, index) => (
          <motion.div
            key={event.id}
            data-event-card
            initial={entrance ? { opacity: 0, y: 30 } : false}
            animate={{opacity:1, y:0}} 
            transition={{ duration: 0.6, delay: Math.max(0, index - staggerFrom) * 0.1, ease: "easeOut" }}
          >
            <EventCard event={event} action={action} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
