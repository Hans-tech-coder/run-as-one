import { eventInstant, eventInstantParts, formatEventInstant } from '@/lib/event-schedule';
import { closingProblem } from '@/lib/registration-window';

/**
 * When an event starts taking sign-ups, as the admin forms hold it.
 *
 * The column is a single instant, but nobody decides an instant: an organizer
 * decides "the 20th, 8 in the morning", which is a date and a time — the same
 * pair the event's own day and gun start are collected as, so the three fields
 * look and behave alike. This module is the one place the two shapes are
 * converted between, so the create form, the edit form and the events table's
 * scheduling modal cannot drift into three slightly different answers.
 *
 * `scheduled` is carried rather than worked out from whether `day` has
 * anything in it. That shortcut is what broke the picker the first time: the
 * date field only appears once the organizer has chosen to schedule, so
 * inferring the choice from the date meant choosing "Schedule The Opening"
 * changed nothing, the fields never appeared, and the card could never be
 * selected. The choice and the date it needs are two different facts, and an
 * organizer who has decided to schedule but has not typed the date yet is a
 * real, nameable state — it is the one `openingProblem` exists to report.
 */
export type OpeningDraft = {
  /** Whether sign-ups are being held until a date, rather than opening at once. */
  scheduled: boolean;
  /** YYYY-MM-DD in Manila. Only meaningful while `scheduled`. */
  day: string;
  /** HH:MM in Manila. Only meaningful while `scheduled`. */
  time: string;
};

/** A race that takes sign-ups from the moment it is published. */
export const OPENS_IMMEDIATELY: OpeningDraft = { scheduled: false, day: '', time: '' };

/**
 * The time of day a newly scheduled opening starts at unless the organizer
 * says otherwise. Picked rather than left blank because a blank time is
 * midnight, and an opening that quietly happens at 12:01 AM is one no runner
 * is awake for — 8 AM is when these announcements actually go out.
 */
export const DEFAULT_OPENING_TIME = '08:00';

/** Whether this draft is holding sign-ups back rather than opening at once. */
export function isScheduledOpening(draft: OpeningDraft): boolean {
  return draft.scheduled;
}

/** The stored instant taken apart into the fields that produced it. */
export function openingDraft(value: Date | string | null | undefined): OpeningDraft {
  if (!value) return OPENS_IMMEDIATELY;
  const { day, time } = eventInstantParts(value);
  return day ? { scheduled: true, day, time } : OPENS_IMMEDIATELY;
}

/**
 * What the form posts: an ISO instant, or null for a race that opens at once.
 *
 * ISO rather than the two fields, because the offset travels with it — the API
 * route is then reading an unambiguous moment instead of re-deciding what zone
 * a bare "2026-09-20 08:00" was typed in, on a server that runs in UTC.
 */
export function openingInstantISO(draft: OpeningDraft): string | null {
  if (!isScheduledOpening(draft)) return null;
  return eventInstant(draft.day, draft.time)?.toISOString() ?? null;
}

/**
 * Why this draft cannot be saved, or null when it can.
 *
 * Only one thing can be wrong — the organizer chose to schedule the opening
 * and then left the date empty or unreadable — and the sentence says exactly
 * that rather than reporting a form-wide failure. The time is allowed to be
 * blank; that is a real answer, and it means midnight.
 */
export function openingProblem(draft: OpeningDraft): string | null {
  if (!isScheduledOpening(draft)) return null;
  if (!eventInstant(draft.day, draft.time)) {
    return 'Pick the date registration opens, or set it to open immediately.';
  }
  return null;
}

/**
 * The draft read back as a sentence, for the admin's own confirmation lines.
 *
 * Deliberately the same `formatEventInstant` the public pages use, so the
 * organizer is reading the words their runners will read rather than an
 * admin-only paraphrase of them.
 */
export function describeOpening(draft: OpeningDraft): string {
  const instant = isScheduledOpening(draft) ? eventInstant(draft.day, draft.time) : null;
  return instant
    ? `Sign-ups open on ${formatEventInstant(instant)}.`
    : 'Sign-ups open as soon as the event is published.';
}

/*
 * The closing date (`registrationClosesAt`) is the same shape — a choice, a
 * day and a time standing for one nullable instant — so it reuses the draft
 * and the picker rather than growing a twin of each. `scheduled: false` here
 * means no deadline: sign-ups run until race day or until someone presses
 * Close.
 */

/** A race whose sign-ups run until race day. */
export const NO_CLOSING_DATE: OpeningDraft = OPENS_IMMEDIATELY;

/**
 * The time of day a newly scheduled close lands on unless the organizer says
 * otherwise: the last minute of the day, because "registration closes on the
 * 20th" is read by runners as "you still have the 20th".
 */
export const DEFAULT_CLOSING_TIME = '23:59';

/** The stored closing instant taken apart into the picker's fields. */
export const closingDraft = openingDraft;

/** What the form posts for the closing date: an ISO instant, or null for none. */
export const closingInstantISO = openingInstantISO;

/**
 * Why this closing date cannot be saved, or null when it can — the same rule
 * the routes enforce (`closingProblem` in lib/registration-window.ts), read
 * against the opening and race day as the form currently holds them, so the
 * organizer sees the refusal under the field before pressing Save.
 */
export function closingDraftProblem(
  closing: OpeningDraft,
  context: {
    opening: OpeningDraft;
    date: string;
    virtualEndDate?: string | null;
    /** The closing instant the event was loaded with, so an untouched past date is not refused. */
    savedClosesAt?: string | null;
  },
): string | null {
  if (!closing.scheduled) return null;
  const closesAt = eventInstant(closing.day, closing.time);
  if (!closesAt) return 'Pick the date registration closes, or keep it open until race day.';
  const opensAt = context.opening.scheduled ? eventInstant(context.opening.day, context.opening.time) : null;
  return closingProblem(closesAt, {
    opensAt,
    date: context.date,
    virtualEndDate: context.virtualEndDate || null,
    changed: !sameMinute(closesAt, context.savedClosesAt),
  });
}

/**
 * Whether a picker's instant is the stored one. To the minute, because the
 * picker has no seconds: a stored value carrying some (written by anything
 * other than this form) must still read as untouched, or saving an unrelated
 * field would be refused for "changing" a date nobody moved.
 */
export function sameMinute(instant: Date | string | null | undefined, stored: Date | string | null | undefined): boolean {
  const minute = (value: Date | string | null | undefined) =>
    value ? Math.floor(new Date(value).getTime() / 60_000) : null;
  return minute(instant) === minute(stored);
}

/** The closing draft read back as a sentence, in the words runners read. */
export function describeClosing(draft: OpeningDraft): string {
  const instant = draft.scheduled ? eventInstant(draft.day, draft.time) : null;
  if (!instant) return 'Sign-ups stay open until race day, unless you close them.';
  return instant.getTime() <= Date.now()
    ? `Sign-ups closed on ${formatEventInstant(instant)}.`
    : `Sign-ups close on ${formatEventInstant(instant)}.`;
}
