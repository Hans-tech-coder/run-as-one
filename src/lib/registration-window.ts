import { eventInstant, formatEventInstant } from '@/lib/event-schedule';

/**
 * **The window sign-ups are open in**: when they open, when they close on
 * their own, and the organizer's closure that ends them early. Split out of
 * registration-gate.ts (which re-exports all of it) when the scheduled close
 * arrived, because these are the rules about *time* — opening date, closing
 * date, race day — and that module had grown into slots, holds and locks as
 * well.
 *
 * Every answer here is read against the clock at request time, never flipped
 * by a cron: Vercel's Hobby plan runs one at most once a day, and a deadline
 * that lands within the hour is not a deadline. So a column whose instant has
 * passed is left as it is rather than cleared — the organizer can still read
 * the date they set — and every reader compares.
 *
 * Client-safe on purpose (it imports only event-schedule.ts): the admin forms
 * validate a closing date with the same rule the routes enforce, so a refusal
 * the organizer reads before saving is the one the server would give.
 */

type Instantish = Date | string | null | undefined;

function asInstant(value: Instantish): Date | null {
  if (!value) return null;
  const instant = value instanceof Date ? value : new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** What a runner is told once the organizer has closed sign-ups. */
export const REGISTRATION_CLOSED_MESSAGE =
  'Registration for this race is closed. The organizer is no longer taking sign-ups. If you have already paid, your entry stands — contact the organizer with any questions.';

/**
 * Whether this event's closing date has arrived. Null — no deadline — never
 * has; a date still ahead has not yet.
 */
export function closingHasPassed(
  event: { registrationClosesAt?: Instantish },
  now: Date = new Date(),
): boolean {
  const closes = asInstant(event.registrationClosesAt);
  return closes !== null && closes.getTime() <= now.getTime();
}

/** Whether a closing date is set and still ahead — what "Closes …" chips show. */
export function closesLater(
  event: { registrationClosesAt?: Instantish },
  now: Date = new Date(),
): boolean {
  const closes = asInstant(event.registrationClosesAt);
  return closes !== null && closes.getTime() > now.getTime();
}

/**
 * Whether sign-ups on this event are closed — by the organizer's Close, or by
 * a closing date that has passed. Both are final in the same way (no note, no
 * "check back"), so every gate treats them as one state, CLOSED; only the
 * sentence the runner reads differs (`closedMessage`).
 */
export function isClosed(
  event: { registrationClosedAt?: Instantish; registrationClosesAt?: Instantish },
  now: Date = new Date(),
): boolean {
  return Boolean(event.registrationClosedAt) || closingHasPassed(event, now);
}

/**
 * The sentence a runner turned away by a closure reads. A schedule names its
 * date, because "closed on November 20 at 11:59 PM" answers the question a
 * runner who missed it is asking; the organizer's Close keeps the fixed
 * sentence. The Close outranks the date when both apply — it is the more
 * deliberate word.
 */
export function closedMessage(
  event: { registrationClosedAt?: Instantish; registrationClosesAt?: Instantish },
): string {
  if (event.registrationClosedAt || !event.registrationClosesAt) return REGISTRATION_CLOSED_MESSAGE;
  const when = formatEventInstant(event.registrationClosesAt);
  return when
    ? `Registration for this race closed on ${when}. The organizer is no longer taking sign-ups. If you have already paid, your entry stands — contact the organizer with any questions.`
    : REGISTRATION_CLOSED_MESSAGE;
}

/**
 * Whether this event's sign-ups have not started yet.
 *
 * Null — the normal case — means the race was open the moment it was
 * published, so there is nothing to wait for. A time already past is not a
 * schedule any more, it is simply an open event.
 *
 * `now` is a parameter so a page and the listing beside it can be answered
 * against the same moment rather than each reading the clock for itself.
 */
export function opensLater(
  event: { registrationOpensAt?: Instantish },
  now: Date = new Date(),
): boolean {
  const opens = asInstant(event.registrationOpensAt);
  return opens !== null && opens.getTime() > now.getTime();
}

/**
 * What a runner is told when they arrive before sign-ups open.
 *
 * It names the instant rather than saying "soon", because the one thing this
 * runner came for is a date they can put in their calendar — and because a
 * race whose opening has no date attached reads as a race that has been
 * forgotten about. The fallback sentence exists only for the impossible row
 * whose column will not parse; nothing that reaches here should need it.
 */
export function openingNote(event: { registrationOpensAt?: Instantish }): string {
  const when = event.registrationOpensAt ? formatEventInstant(event.registrationOpensAt) : '';
  return when
    ? `Sign-ups for this race open on ${when}. Nothing to do until then — the page stays here, so come back when it opens or set yourself a reminder.`
    : 'Sign-ups for this race have not opened yet. The organizer has listed it early so you can plan for it; check back for the opening date.';
}

/**
 * An opening or closing instant as the database should hold it, from whatever
 * the admin form posted.
 *
 * Blank, null and a missing key all mean "no schedule", which is null.
 * Anything that will not read as an instant returns `undefined` instead, and
 * every route turns that into a refusal rather than storing the null it
 * resembles: an opening date that silently failed to save would put a race on
 * sale the moment it was published, and a closing date that did would leave
 * it on sale past the deadline the organizer announced.
 */
export function asOpeningInstant(value: unknown): Date | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (!(value instanceof Date) && typeof value !== 'string') return undefined;
  const instant = value instanceof Date ? value : new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}

/** The same parse for the closing date; one rule, named for its reader. */
export const asClosingInstant = asOpeningInstant;

/** What a route says when the opening instant it was sent will not parse. */
export const OPENING_INSTANT_ERROR =
  'Registration opening must be a date and time. Pick both, or choose to open registration immediately.';

/** What a route says when the closing instant it was sent will not parse. */
export const CLOSING_INSTANT_ERROR =
  'Registration closing must be a date and time. Pick both, or choose to keep registration open until race day.';

/**
 * The last instant of race day in Manila — the latest a closing date may
 * fall. A virtual run's race day is the last day of its window. Past it, the
 * race is over and sign-ups close anyway (event-schedule.ts), so a later
 * closing date would promise runners a deadline that never applies.
 */
export function raceDayEnds(event: { date: string; virtualEndDate?: string | null }): Date | null {
  const midnight = eventInstant(event.virtualEndDate || event.date, '23:59');
  return midnight ? new Date(midnight.getTime() + 59_999) : null;
}

/**
 * Why this closing date cannot be saved, or null when it can.
 *
 * Three rules, each with its own sentence so the organizer knows which box to
 * fix: after the opening (a window that closes before it opens takes no
 * runners at all), on or before race day, and — only when the date is being
 * changed — not already past, because setting a deadline that has gone is
 * Close by another name and should be pressed as one. An unchanged past date
 * is allowed through, or an event that closed on schedule could never be
 * saved again.
 */
export function closingProblem(
  closesAt: Date | null,
  context: {
    opensAt?: Date | null;
    date: string;
    virtualEndDate?: string | null;
    /** Whether this save changes the closing date. */
    changed: boolean;
  },
  now: Date = new Date(),
): string | null {
  if (!closesAt) return null;
  if (context.opensAt && closesAt.getTime() <= context.opensAt.getTime()) {
    return `Registration must close after it opens (${formatEventInstant(context.opensAt)}). Pick a later closing date, or move the opening earlier.`;
  }
  const ends = raceDayEnds(context);
  if (ends && closesAt.getTime() > ends.getTime()) {
    return 'Registration must close on or before race day — sign-ups end then anyway. Pick an earlier closing date.';
  }
  if (context.changed && closesAt.getTime() <= now.getTime()) {
    return 'That closing date has already passed. Pick a date still ahead, or use Close Sign-Ups to close registration now.';
  }
  return null;
}

/**
 * What a route says when a Reopen would leave a passed closing date standing:
 * the closure would be lifted and the event would read CLOSED anyway. The
 * organizer has to name a new deadline or drop it (the owner's call, Q3).
 */
export const REOPEN_PAST_CLOSING_ERROR =
  'The closing date has already passed, so reopening alone would not let anyone register. Set a new closing date, or remove it, to reopen sign-ups.';

/**
 * The quiet line under a sign-up badge that names the closing date: "Closes
 * November 20, 2026 at 11:59 PM" while it is ahead, "Closed …" once it has
 * closed the race by itself — or null when there is nothing to say. Shared by
 * the events table, the client viewer's cards and the race report, so the
 * three never word the same deadline differently. A race the organizer closed
 * by hand, one already run, or one taking no sign-ups here gets no line: the
 * badge is the whole answer.
 */
export function closingLine(
  event: { registrationClosedAt?: Instantish; registrationClosesAt?: Instantish },
  state: string,
  now: Date = new Date(),
): string | null {
  if (!event.registrationClosesAt) return null;
  if (state === 'CLOSED') {
    return !event.registrationClosedAt && closingHasPassed(event, now)
      ? `Closed ${formatEventInstant(event.registrationClosesAt)}`
      : null;
  }
  if (state === 'FINISHED' || state === 'EXTERNAL') return null;
  return closesLater(event, now) ? `Closes ${formatEventInstant(event.registrationClosesAt)}` : null;
}
