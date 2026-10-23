/**
 * Which /events tab an address asks for (PAST_EVENTS_PLAN.md D1). Its own
 * module, not EventsTabs.tsx, because the server page calls it and a function
 * exported from a client file cannot be called on the server.
 */

export type EventsView = 'upcoming' | 'past';

/**
 * The Past tab's address, for the pages that point at it from outside /events
 * (the home page, /results, Our Services — PAST_EVENTS_PLAN.md §3).
 */
export const PAST_EVENTS_HREF = '/events?view=past';

/** What `?view=` asks for. Anything but "past" is the default tab. */
export function asEventsView(value: unknown): EventsView {
  return value === 'past' ? 'past' : 'upcoming';
}
