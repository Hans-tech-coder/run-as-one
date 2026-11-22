"use client";

import React, { createContext } from 'react';
import Link from 'next/link';
import { Camera, ArrowRight } from 'lucide-react';
import PosterFrame from './PosterFrame';
import LinkPendingIcon from './ui/LinkPendingIcon';
import { formatEventInstantShort, formatEventRange, formatEventWeekdayShort } from '@/lib/event-schedule';
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
  /**
   * The race's distances or options, as the organizer named them ("5KM",
   * "Half Marathon"), soonest-listing pages only. Shown as chips under the
   * venue because a distance is the first thing a runner filters on.
   */
  distances?: string[];
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
  register: { label: 'Register', path: (slug) => `/events/${slug}` },
  results: { label: 'See results', path: (slug) => `/results/${slug}` },
};

/** "Sat, Oct 5" — a past card sits under its year's heading, so the year is said once there. */
function dayInYear(date: string): string {
  return formatEventWeekdayShort(date).replace(/,\s*\d{4}$/, '');
}

/**
 * Where a past card goes and what its chip says (D3): each race to where its
 * answer is. Times up → the ranking. A virtual run says when its window
 * ended; a timed race still inside its window says times are coming; any
 * other says when it was held, which is all that is left to say.
 */
function pastCard(event: DBEvent): { badge: string; quiet: boolean; label: string; path: (slug: string) => string } {
  if (event.hasResults) return { badge: 'Results are up', quiet: false, ...ACTIONS.results };
  const view = { quiet: true, label: 'See event', path: ACTIONS.register.path };
  if (isVirtual(event)) return { badge: `Ended ${dayInYear(event.virtualEndDate ?? event.date)}`, ...view };
  if (event.resultsSoon) return { badge: 'Results soon', ...view };
  return { badge: `Held ${dayInYear(event.date)}`, ...view };
}

/** The corner chip, and the word the button uses instead of "Register Now". */
const CLOSURES = {
  CLOSED: { badge: 'Sign-ups closed', label: 'See event' },
  FULL: { badge: 'Full', label: 'See event' },
  PAUSED: { badge: 'Sign-ups paused', label: 'See event' },
  // Overwritten with the date below when the card has one. The bare word is
  // the fallback for a row whose instant will not parse, which should not
  // happen and must still say something true if it does.
  SCHEDULED: { badge: 'Opens soon', label: 'See event' },
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

  const when = isVirtual(event)
    ? formatEventRange(event.date, event.virtualEndDate ?? null)
    : formatEventWeekdayShort(event.date);
  const where = isVirtual(event) ? VIRTUAL_RUN_WHERE : event.location;
  const distances = event.distances ?? [];
  const shownDistances = distances.slice(0, 4);

  // The Paper card (site.css `.site-card`): the poster whole on top, nothing
  // printed over it — an organizer's banner already carries the race's name
  // in its own lettering, and a second title on top of it was the clutter the
  // audit caught — and the facts on the card below. The action link in the
  // foot stretches over the whole card, so the card is one target, named
  // with the race ("Register: Pink Run 2026") for a screen reader.
  return (
    <article className="site-card">
      <PosterFrame src={event.imageUrl} alt="" className="site-card__poster" iconSize={40} />
      <div className="site-card__body">
        <span className="site-card__date">{when}</span>
        <h3 className="site-card__title">{event.title}</h3>
        <p className="site-card__where">{where}</p>
        {shownDistances.length > 0 && (
          <ul className="site-card__chips" aria-label="Distances">
            {shownDistances.map((name) => (
              <li key={name} className="site-chip">{name}</li>
            ))}
            {distances.length > shownDistances.length && (
              <li className="site-chip">+{distances.length - shownDistances.length} more</li>
            )}
          </ul>
        )}
        <div className="site-card__foot">
          {/* Where the race stands, said in words: why it cannot be entered,
              when it opens, or where its times are. Absent on a race that is
              simply open, which needs no label. */}
          <span className="site-card__status">
            {past && event.hasPhotos && (
              <span className="mr-2 inline-flex items-center gap-1 align-middle">
                <Camera size={14} aria-hidden="true" /> Photos
              </span>
            )}
            {badge}
          </span>
          <Link href={href} className="site-card__go" aria-label={`${quietLabel ?? label}: ${event.title}`}>
            {quietLabel ?? label}
            <LinkPendingIcon>
              <ArrowRight size={16} />
            </LinkPendingIcon>
          </Link>
        </div>
      </div>
    </article>
  );
}

/**
 * Whether cards mounting now rise in one by one. Cards no longer rise in at
 * all (the Paper redesign: no entrance on load or scroll), so nothing reads
 * this; /events' tab switch still provides it until that page is rebuilt.
 */
export const EventGridEntrance = createContext(true);

export default function EventGrid({
  events,
  action = 'register',
}: {
  events: DBEvent[];
  action?: EventCardAction;
  /** Kept for callers from before cards stopped rising in; ignored. */
  staggerFrom?: number;
}) {
  // Nothing fades or rises in: the audit caught cards blank on a phone until
  // their entrance ran. `data-fit="4"` puts four to a row on a wide screen
  // whenever three would leave one card alone on the last row.
  // `data-fit="3"` keeps exactly three in one row on a tablet.
  const fit = events.length > 1 && events.length % 3 === 1 ? '4' : events.length === 3 ? '3' : undefined;
  return (
    <ul className="site-grid m-0 list-none p-0" data-fit={fit}>
      {events.map((event) => (
        <li key={event.id} data-event-card>
          <EventCard event={event} action={action} />
        </li>
      ))}
    </ul>
  );
}
