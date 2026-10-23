/**
 * Which /events tab an address asks for (PAST_EVENTS_PLAN.md D1). Its own
 * module, not EventsTabs.tsx, because the server page calls it and a function
 * exported from a client file cannot be called on the server.
 */

export type EventsView = 'upcoming' | 'past';

/** What `?view=` asks for. Anything but "past" is the default tab. */
export function asEventsView(value: unknown): EventsView {
  return value === 'past' ? 'past' : 'upcoming';
}
