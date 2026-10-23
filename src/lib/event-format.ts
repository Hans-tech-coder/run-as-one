/**
 * Where an event is run: at a venue on one race day, or anywhere inside a
 * window of days (VIRTUAL_RUN_PLAN.md).
 *
 * A separate axis from `eventType` on purpose (D2). `eventType` is what the
 * event sells — distances or packages — and a virtual run can sell either, so
 * folding "virtual" into it as a third value would force a choice the
 * organizer does not have to make.
 *
 * The rule this module owns: a virtual run has no venue, no gun start and no
 * pacers (D6). Its `location` is stored as the fixed word "Virtual", its
 * start and end times and pacer codes are never asked for, and its run window
 * is `date` (first day) through `virtualEndDate` (last day), which must not
 * end before it starts (D4). Its registration — categories, price, logistics,
 * payment — is the same event as on-site (D1, D5). It has **no results**
 * (the owner, 2026-10-21, dropping Phase B): no results upload, no Results
 * screen and no public results pages, so no e-certificate either
 * (`RESULTS_EVENTS`, `takesResults`), and a results-only race cannot be one
 * (`RESULTS_ONLY_VIRTUAL_ERROR`).
 * It also owns whether a race keeps time (`isTimed`, PAST_EVENTS_PLAN.md D7)
 * and so how long a finished one may promise its results (`awaitingResults`).
 * Once an event has a registration its format is locked (D7): a runner who
 * paid for a race at a venue did not sign up to run alone, and vice versa.
 *
 * Stored as a plain string column like `eventType`, so asEventFormat() is the
 * only guard between a typo'd payload and a half-virtual event.
 */

import type { Prisma } from '@prisma/client';
import { isCalendarDay, today } from './event-schedule';
import { sellsPackages } from './event-type';

export const EVENT_FORMATS = {
  /** One race day at a venue, with a gun start. */
  ONSITE: 'ONSITE',
  /** Run anywhere between `date` and `virtualEndDate`. */
  VIRTUAL: 'VIRTUAL',
} as const;

export type EventFormat = (typeof EVENT_FORMATS)[keyof typeof EVENT_FORMATS];

/** Every event that existed before this setting was run at a venue. */
export const DEFAULT_EVENT_FORMAT: EventFormat = EVENT_FORMATS.ONSITE;

/** What `location` holds for a virtual run, so every listing still has a line to print. */
export const VIRTUAL_LOCATION = 'Virtual';

export function asEventFormat(value: unknown): EventFormat {
  return value === EVENT_FORMATS.VIRTUAL ? EVENT_FORMATS.VIRTUAL : DEFAULT_EVENT_FORMAT;
}

/** Whether this event is run anywhere inside a window rather than at a venue. */
export function isVirtual(event: { format?: unknown }): boolean {
  return asEventFormat(event.format) === EVENT_FORMATS.VIRTUAL;
}

/**
 * The events the site keeps results for: every one but a virtual run. Spread
 * into every query that reaches a race's results — the public pages, the
 * admin Results screens, the upload and edit routes — so a virtual run reads
 * there as "not found", the same answer as a race that does not exist.
 */
export const RESULTS_EVENTS = {
  format: { not: EVENT_FORMATS.VIRTUAL },
} satisfies Prisma.EventWhereInput;

/** `RESULTS_EVENTS` for one event already in hand. */
export function takesResults(event: { format?: unknown }): boolean {
  return !isVirtual(event);
}

/**
 * Whether this race keeps time, so its finished page may promise results
 * (PAST_EVENTS_PLAN.md D7). Many fun runs and every virtual run have no
 * timing, so the answer follows the event's kind until staff say otherwise:
 *
 * - a virtual run never (it takes no results at all), whatever is stored;
 * - a results-only race always, since holding times is all it exists for;
 * - otherwise `timedResults` when staff set it, and when it is null a race
 *   is timed and a fun run is not.
 *
 * Null rather than a default on the column, so a race switched between RACE
 * and FUN_RUN follows its new kind until someone chooses, and no backfill was
 * needed. `timedResults` is optional in the type for a caller that never
 * selected it, which then reads as null.
 */
export function isTimed(event: {
  format?: unknown;
  eventType?: unknown;
  resultsOnly?: boolean | null;
  timedResults?: boolean | null;
}): boolean {
  if (!takesResults(event)) return false;
  if (event.resultsOnly) return true;
  if (typeof event.timedResults === 'boolean') return event.timedResults;
  return !sellsPackages(event);
}

/**
 * How long after race day a timed race without results still says its times
 * are coming (D5, the owner: 14 days). Past this, a race whose times never
 * came stops promising them rather than promising forever.
 */
export const RESULTS_PROMISE_DAYS = 14;

/**
 * Whether a finished race should still tell runners its times are on the way:
 * it is timed (`isTimed`) and race day was at most `RESULTS_PROMISE_DAYS` ago.
 * Uploaded results are not checked here — those win on their own, by sending
 * the runner to /results.
 */
export function awaitingResults(
  event: Parameters<typeof isTimed>[0] & { date: string },
  day: string = today(),
): boolean {
  if (!isTimed(event) || !isCalendarDay(event.date)) return false;
  const [year, month, date] = event.date.split('-').map(Number);
  const until = new Date(Date.UTC(year, month - 1, date + RESULTS_PROMISE_DAYS))
    .toISOString()
    .slice(0, 10);
  return day <= until;
}

/**
 * Why a virtual run's window cannot be saved, or null when it can. `date` is
 * checked by the routes already; this adds the end and the order between them.
 */
export function runWindowError(date: string, virtualEndDate: unknown): string | null {
  if (!isCalendarDay(virtualEndDate)) return 'Choose the last day of the run window.';
  if (virtualEndDate < date) return 'The run window cannot end before it starts.';
  return null;
}

/** The refusal when an event with registrations is asked to change format (D7). */
export const FORMAT_LOCKED_ERROR =
  'This event already has registrations, so its format can no longer change.';

/**
 * The refusal when a results-only race is asked to be virtual: the one takes
 * no registrations and the other no results, so together they make an event
 * that can take neither.
 */
export const RESULTS_ONLY_VIRTUAL_ERROR =
  'A results-only race cannot be a virtual run, because a virtual run has no results.';

/**
 * The "where" half of that line on its own, for a screen that sets the range
 * apart — a card keeps "Oct 15–31" on one line rather than breaking at the
 * dash — and for the emails' *Where* row.
 */
export const VIRTUAL_RUN_WHERE = 'Virtual · Run anywhere';

/**
 * The format-dependent columns of a create or edit, read from the request
 * body in one place so POST and PUT cannot drift apart.
 *
 * On-site keeps the old behaviour exactly: a venue is required and the times
 * are whatever the form sent. Virtual ignores whatever venue and times arrive
 * (a form switched from on-site still holds them) and stores the fixed
 * location, no times, and a validated window end. On-site never keeps a
 * window end, which is what lets the schedule read a non-null one as "virtual".
 */
export type FormatFields =
  | {
      ok: true;
      format: EventFormat;
      virtualEndDate: string | null;
      location: string;
      startTime: string | null;
      endTime: string | null;
    }
  | { ok: false; error: string; field: 'location' | 'virtualEndDate' };

export function readFormatFields(
  body: { format?: unknown; virtualEndDate?: unknown; location?: unknown; startTime?: unknown; endTime?: unknown },
  date: string,
): FormatFields {
  const format = asEventFormat(body.format);
  if (format === EVENT_FORMATS.VIRTUAL) {
    const error = runWindowError(date, body.virtualEndDate);
    if (error) return { ok: false, error, field: 'virtualEndDate' };
    return {
      ok: true,
      format,
      virtualEndDate: body.virtualEndDate as string,
      location: VIRTUAL_LOCATION,
      startTime: null,
      endTime: null,
    };
  }
  if (typeof body.location !== 'string' || !body.location) {
    return { ok: false, error: 'Missing required fields', field: 'location' };
  }
  return {
    ok: true,
    format,
    virtualEndDate: null,
    location: body.location,
    startTime: typeof body.startTime === 'string' && body.startTime ? body.startTime : null,
    endTime: typeof body.endTime === 'string' && body.endTime ? body.endTime : null,
  };
}
