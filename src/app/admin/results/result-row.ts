import type { EventRow } from '../events/event-row';

/**
 * One row of the Results list as /admin/results hands it over. It is an
 * EventRow, so the Events table's pieces — the delete modal, the row actions —
 * take it as it is; the rest is what only this list shows.
 */
export type ResultRow = EventRow & {
  slug: string;
  /** Registration ran elsewhere and Run As One only publishes the results (RESULTS_ONLY_EVENT_PLAN.md). */
  resultsOnly: boolean;
  /** How many RaceResult rows the race has. */
  finishers: number;
  /** "Custom" when the race has its own template; Run As One's own otherwise. */
  certificate: 'Custom' | 'Default';
};

/** R1's badge: where the race's runners signed up. */
export const RESULT_KINDS = {
  REGISTERED: { label: 'Registered here', tone: 'info' },
  // Neutral, like the Events table's Results only badge (registration-state-badge.ts).
  RESULTS_ONLY: { label: 'Results only', tone: 'neutral' },
} as const;

export function resultKind(row: ResultRow): keyof typeof RESULT_KINDS {
  return row.resultsOnly ? 'RESULTS_ONLY' : 'REGISTERED';
}
