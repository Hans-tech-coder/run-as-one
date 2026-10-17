import type { Prisma } from '@prisma/client';
import { formatEventInstant } from './event-schedule';

/**
 * Whether the public may see an event yet: draft, scheduled or published.
 *
 * One column, `Event.publishAt`, holds all three (EVENT_PUBLISH_PLAN.md D1):
 * null is a draft, a past instant is published, a future one is scheduled.
 * Scheduled events go live by themselves because every public read compares
 * the column against the clock at request time (D2) — there is no cron to run
 * late. The listings are `force-dynamic`, so the comparison is always fresh.
 *
 * Every public read of an event — listings, event and register pages, both
 * checkout routes, promo lookup, results, client subdomains — and every client
 * viewer read (D7) goes through `publishedEvents()` or `isPublished()`, so a
 * draft cannot leak through one door while the others are shut. Staff screens
 * do not filter: drafts are what they are there to finish.
 *
 * Not the same as `registrationOpensAt` (lib/registration-gate.ts): that one is
 * when sign-ups start on an event already visible. An event may be published
 * as a teaser and open later, never the other way round (D8).
 */

export const PUBLISH_STATES = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
} as const;

export type PublishState = (typeof PUBLISH_STATES)[keyof typeof PUBLISH_STATES];

type Publishable = { publishAt?: Date | string | null };

function instant(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Where-fragment for every public read: events whose publish time has passed. */
export function publishedEvents(now: Date = new Date()): Prisma.EventWhereInput {
  return { publishAt: { lte: now } };
}

export function publishState(event: Publishable, now: Date = new Date()): PublishState {
  const at = instant(event.publishAt);
  if (!at) return PUBLISH_STATES.DRAFT;
  return at.getTime() > now.getTime() ? PUBLISH_STATES.SCHEDULED : PUBLISH_STATES.PUBLISHED;
}

export function isPublished(event: Publishable, now: Date = new Date()): boolean {
  return publishState(event, now) === PUBLISH_STATES.PUBLISHED;
}

/**
 * The publish time a route was sent: `'now'` is this instant, null or blank is
 * a draft, an ISO string is that instant. Undefined means it would not parse,
 * which the route refuses rather than guessing a draft or a publish.
 */
export function asPublishInstant(value: unknown, now: Date = new Date()): Date | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (value === 'now') return now;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export const PUBLISH_INSTANT_ERROR =
  'Publish time must be a date and time. Pick both, publish now, or save as a draft.';

/**
 * Why this publish time cannot stand beside this registration opening, or
 * null when it can (D8). Sign-ups opening on an event nobody can see yet would
 * make the opening date a lie, so the event must go public first.
 *
 * An opening already in the past has nothing left to fire: sign-ups simply
 * start the moment the event goes public, so it never conflicts. Without that,
 * a draft whose opening date had passed could never be published.
 */
export function publishConflict(
  publishAt: Date | null,
  registrationOpensAt: Date | string | null | undefined,
  now: Date = new Date(),
): string | null {
  const opens = instant(registrationOpensAt);
  if (!publishAt || !opens) return null;
  if (opens.getTime() <= now.getTime()) return null;
  if (publishAt.getTime() > opens.getTime()) {
    return `Publish the event on or before sign-ups open (${formatEventInstant(opens)}), or move the registration opening later.`;
  }
  return null;
}

/** The state as a sentence for the admin's own confirmation lines. */
export function describePublish(event: Publishable, now: Date = new Date()): string {
  const state = publishState(event, now);
  if (state === PUBLISH_STATES.DRAFT) return 'This event is a draft. Only your team can see it.';
  const at = instant(event.publishAt)!;
  return state === PUBLISH_STATES.SCHEDULED
    ? `This event goes public on ${formatEventInstant(at)}.`
    : 'This event is public.';
}
