import type { RegistrationState } from '@/lib/registration-gate';

export type CategoryChip = { id: string; name: string; distance?: string | null };

/**
 * One row as /admin/events hands it over: the Prisma event plus the counts and
 * the registration state worked out on the server. Only the pieces this table
 * reads are named; the page passes the whole event, and the rest rides along.
 */
export type EventRow = {
  id: string;
  /** Its place in the list's order, fixed on the server (events/page.tsx), so filtering never renumbers. */
  listNo?: number;
  /** Runners holding a place: paid, a bank transfer awaiting verification, an unpaid online checkout (heldPlacesByCategory). */
  registered?: { paid: number; awaiting: number; unpaid: number };
  client?: { id: string; name: string } | null;
  title: string;
  date: string;
  location: string;
  categories?: CategoryChip[];
  /** EXTERNAL for a results-only event (registrationState() in lib/registration-gate.ts). */
  registrationState?: RegistrationState;
  registrationOpensAt?: string | Date | null;
  registrationPaused?: boolean | null;
  registrationClosedAt?: string | Date | null;
  /** Every option has filled (events/page.tsx) — what a reopened row falls back to. */
  soldOut?: boolean;
  /** What this person may do from the row's menu (events/page.tsx). Absent means an owner. */
  access?: { edit: boolean; delete: boolean; pacers?: boolean };
  /** How many of this race's pacers have not been sent their code (events/page.tsx). */
  pacersNotSent?: number;
  _count?: { registrations: number };
};

/**
 * A results-only event: the client takes sign-ups elsewhere and this platform
 * only publishes the results (RESULTS_ONLY_EVENT_PLAN.md). Read off the state
 * the server worked out rather than off `resultsOnly`, so the badge, the menu
 * and the Registrants cell all follow the one answer registrationState() gave.
 */
export function isResultsOnlyRow(event: EventRow) {
  return event.registrationState === 'EXTERNAL';
}
