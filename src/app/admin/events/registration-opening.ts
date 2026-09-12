import { eventInstant, eventInstantParts, formatEventInstant } from '@/lib/event-schedule';

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
