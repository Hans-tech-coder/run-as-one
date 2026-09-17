/**
 * What an event's registration state is called on a badge, and in what tone.
 *
 * Green for open and amber for paused, matching the badges on the registrants
 * screen. Full and finished are neither: they are not warnings and not good
 * news, they are simply what is true, so they take the neutral badge added for
 * them in Admin.css.
 *
 * Its own module because two screens draw it — the team's events table and a
 * client viewer's event cards (ADMIN_MERGE_PLAN.md, Batch 4) — one a client
 * component and the other a server one, and a race must not read "Paused" on
 * one and something else on the other.
 */
export const REGISTRATION_STATES = {
  OPEN: { label: 'Open', tone: 'success' },
  PAUSED: { label: 'Paused', tone: 'pending' },
  // Amber like Paused, and for the same reason the badge tones give amber to
  // PENDING: this is a race waiting on a date, not one that needs anybody.
  // What separates the two in the cell is the line underneath, which names
  // the date — a badge reading only "Scheduled" would leave the organizer
  // opening the modal to find out when.
  SCHEDULED: { label: 'Scheduled', tone: 'pending' },
  FULL: { label: 'Full', tone: 'neutral' },
  FINISHED: { label: 'Race Over', tone: 'neutral' },
} as const;
