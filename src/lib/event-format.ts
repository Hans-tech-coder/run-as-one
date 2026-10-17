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
 * end before it starts (D4). Everything else — categories, price, logistics,
 * payment, results, certificates — is the same event as on-site (D1, D5).
 * Once an event has a registration its format is locked (D7): a runner who
 * paid for a race at a venue did not sign up to run alone, and vice versa.
 *
 * Stored as a plain string column like `eventType`, so asEventFormat() is the
 * only guard between a typo'd payload and a half-virtual event.
 */

import { isCalendarDay } from './event-schedule';

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
