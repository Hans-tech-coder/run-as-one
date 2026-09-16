/**
 * Where an organizer account stands, and what each standing lets it do.
 *
 * Four surfaces have to agree about this: the superadmin screen that moves a
 * status, the chips and badges that find and show it, the `PATCH` route that
 * stores it, and the sign-in path (`auth/login`, `getActor()`, the staff
 * invitation) that decides whether the account may be used at all. Keeping the
 * vocabulary here means a status added later lands in all four at once —
 * the same job `feedback.ts` and `organizer-application.ts` do for theirs.
 *
 * **Sign-in is an allowlist.** It used to be a blocklist of `PENDING` and
 * `SUSPENDED`, which meant a new status was let in by default: adding
 * `REJECTED` to that shape would have handed a refused applicant a working
 * account. `organizerCanSignIn` is true for `APPROVED` and nothing else, so
 * the next status added inherits the safe answer rather than the dangerous one.
 *
 * `status` stays a plain string column, so a new status needs no migration —
 * it needs an entry here.
 */

export const ORGANIZER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;

export type OrganizerStatus = (typeof ORGANIZER_STATUSES)[number];

/** The one status an organizer's account can be used in. */
export const SIGN_IN_STATUSES: readonly OrganizerStatus[] = ['APPROVED'];

/**
 * Whether an organizer in this status may sign in, accept a staff invitation,
 * or have its staff sessions honoured. Anything not named in SIGN_IN_STATUSES
 * is refused — including a status this module has never heard of.
 */
export function organizerCanSignIn(status: string): boolean {
  return (SIGN_IN_STATUSES as readonly string[]).includes(status);
}

/**
 * How each status is put to the super admin. `badge` is the `.status-badge`
 * tone in Admin.css.
 *
 * Rejected and Suspended are different news and wear different tones: a
 * rejection is an application that never became an account (red, final unless
 * reconsidered), a suspension is a working account switched off (amber, the
 * thing somebody may come back from).
 */
export const ORGANIZER_STATUS_COPY: Record<
  OrganizerStatus,
  { label: string; badge: 'neutral' | 'success' | 'danger' | 'pending' }
> = {
  PENDING: { label: 'Pending', badge: 'neutral' },
  APPROVED: { label: 'Approved', badge: 'success' },
  REJECTED: { label: 'Rejected', badge: 'danger' },
  SUSPENDED: { label: 'Suspended', badge: 'pending' },
};

/** The status, or null when it is not one this app knows. */
export function asOrganizerStatus(value: unknown): OrganizerStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (ORGANIZER_STATUSES as readonly string[]).includes(upper)
    ? (upper as OrganizerStatus)
    : null;
}

/** What the screen calls a status. Falls back to the stored text, so a row in
 *  a status nobody listed here still reads as itself rather than as nothing. */
export function organizerStatusLabel(status: string): string {
  const known = asOrganizerStatus(status);
  return known ? ORGANIZER_STATUS_COPY[known].label : status;
}

export function organizerStatusBadge(status: string): string {
  const known = asOrganizerStatus(status);
  return known ? ORGANIZER_STATUS_COPY[known].badge : 'neutral';
}

/**
 * The decisions on offer from each status, in the order the buttons stand.
 *
 * - **Pending** is approved or rejected. It is not suspended: suspending says an
 *   account was switched off, and an application that was never opened was
 *   not — which is the whole reason `REJECTED` exists.
 * - **Approved** can only be suspended. It is not rejected, for the same reason
 *   the other way round.
 * - **Suspended** is reinstated, and **Rejected** is reconsidered, both by
 *   approving.
 *
 * Nothing moves an account back to Pending: that is where an application
 * starts, not a decision anybody makes. A status this module does not know
 * (a row written by hand) is offered approve and suspend, the two decisions
 * that were always available.
 */
export function decisionsFrom(status: string): OrganizerStatus[] {
  switch (asOrganizerStatus(status)) {
    case 'PENDING':
      return ['APPROVED', 'REJECTED'];
    case 'APPROVED':
      return ['SUSPENDED'];
    case 'SUSPENDED':
    case 'REJECTED':
      return ['APPROVED'];
    default:
      return ['APPROVED', 'SUSPENDED'];
  }
}

export function canDecide(from: string, to: OrganizerStatus): boolean {
  return decisionsFrom(from).includes(to);
}

/**
 * The written reason a rejection carries. Required — a refusal nobody can
 * explain later is the one this screen exists to stop — and bounded, because
 * it is a reason and not a letter.
 */
export const MIN_STATUS_NOTE = 10;
export const MAX_STATUS_NOTE = 1_000;

/** The trimmed reason, or the sentence that says what is wrong with it. */
export function readStatusNote(
  value: unknown,
): { note: string; error?: undefined } | { note?: undefined; error: string } {
  const note = typeof value === 'string' ? value.trim() : '';
  if (!note) return { error: 'Write why this application is being rejected.' };
  if (note.length < MIN_STATUS_NOTE) {
    return { error: `Give a little more detail — at least ${MIN_STATUS_NOTE} characters.` };
  }
  if (note.length > MAX_STATUS_NOTE) {
    return { error: `Keep the reason under ${MAX_STATUS_NOTE.toLocaleString('en-PH')} characters.` };
  }
  return { note };
}
