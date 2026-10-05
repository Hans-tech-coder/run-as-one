/**
 * Following up an unpaid checkout (UNPAID_FOLLOWUP_PLAN.md Batch 1): what a
 * staff member records after trying to reach the runner, and how the latest
 * attempt reads on the Unpaid checkouts tab.
 *
 * **A follow-up is a line in the audit trail** (`registration.followed_up`,
 * decision D2), never a column on the order. Every attempt is kept with who
 * made it and when, so two staff members on race-week can see that a runner
 * was already called, and nothing is overwritten the way the order's single
 * `remarks` note would be. The schema does not grow for it. The row shows only
 * the latest attempt; the activity screen holds the rest.
 *
 * **The outcome is a code, the note is free text.** The Follow-up filter
 * matches on the code, so it is one of a fixed list; what the runner actually
 * said goes in the note. Codes are never renamed once written, since the trail
 * keeps them; a new outcome is added to the end of the list.
 *
 * Free of Prisma and of `next/headers`, because the tab imports it. The query
 * is `latestFollowUps` in `activity-store.ts`.
 */

export const FOLLOW_UP_OUTCOMES = [
  'CONTACTED',
  'NO_ANSWER',
  'WILL_PAY',
  'NOT_INTERESTED',
  'WRONG_NUMBER',
] as const;

export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

export const FOLLOW_UP_LABELS: Record<FollowUpOutcome, string> = {
  CONTACTED: 'Contacted',
  NO_ANSWER: 'No answer',
  WILL_PAY: 'Will pay',
  NOT_INTERESTED: 'Not interested',
  WRONG_NUMBER: 'Wrong number',
};

/** The Follow-up filter's value for an order nobody has logged yet. */
export const NOT_CONTACTED = 'NOT_CONTACTED';

/** Long enough for what a runner said; short enough to read on a card. */
export const FOLLOW_UP_NOTE_MAX = 300;

/** The latest follow-up on an order, as the trail recorded it. */
export type FollowUpRecord = {
  outcome: FollowUpOutcome;
  note: string | null;
  /** The staff member's name at the time. */
  by: string;
  /** ISO. */
  at: string;
};

export function asFollowUpOutcome(value: unknown): FollowUpOutcome | null {
  return typeof value === 'string' && (FOLLOW_UP_OUTCOMES as readonly string[]).includes(value)
    ? (value as FollowUpOutcome)
    : null;
}

/**
 * "2h ago": how long since the last attempt, which is the question a staff
 * member scanning the list is asking ("did someone try this morning?"). Worded
 * on the server against one `now`, so the page and its hydration agree.
 */
export function followUpAgo(at: Date | string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(at).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
