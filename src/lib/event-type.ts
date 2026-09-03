/**
 * What an event sells to its runners.
 *
 * A race sells distance categories — 5K, 10K, 42K — and the distance is the
 * whole point, so it is required and shown everywhere. A fun run (a charity
 * run, a community run) has no distances to choose between; what the runner
 * picks is an inclusion package: Basic, Full, and so on.
 *
 * Both are rows in the same Category table. This flag is what tells the admin
 * forms which fields to ask for and the wizard which shape to render, so the
 * two can never disagree about what an event is.
 *
 * Stored as a plain string column, matching `registrationForm`, `status` and
 * `paymentMethod`. That leaves asEventType() as the only guard between a
 * typo'd payload and a form asking for fields the event does not have.
 */

export const EVENT_TYPES = {
  /** Distance categories. Distance is required. */
  RACE: 'RACE',
  /** Inclusion packages with an optional poster. No distances. */
  FUN_RUN: 'FUN_RUN',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/**
 * Every event that existed before this setting was a race, so that is the
 * fallback: it is the only value that cannot lose information, since a race
 * row carries a distance a package row does not have.
 */
export const DEFAULT_EVENT_TYPE: EventType = EVENT_TYPES.RACE;

export function asEventType(value: unknown): EventType {
  return value === EVENT_TYPES.FUN_RUN ? EVENT_TYPES.FUN_RUN : DEFAULT_EVENT_TYPE;
}

/** Whether this event's categories are packages rather than distances. */
export function sellsPackages(event: { eventType?: unknown }): boolean {
  return asEventType(event.eventType) === EVENT_TYPES.FUN_RUN;
}
