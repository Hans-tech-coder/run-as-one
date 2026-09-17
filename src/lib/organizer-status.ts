/**
 * Which `Organizer` row is Run As One, and whether it — and so its team — may
 * be signed in to.
 *
 * **There is one tenant.** Since ADMIN_MERGE_PLAN.md, Run As One's staff create
 * every event and validate every payment, and an organization a race is run
 * for is a `Client`, not an Organizer row. Run As One's own row
 * (`RUN_AS_ONE_ORGANIZER_ID`) owns every event, promotion, membership and the
 * audit trail, and **it is the only Organizer row that signs in** — as the
 * owner, labelled Super Admin (`ROLE_LABELS.OWNER`). Sign-in pins that id
 * rather than trusting `role` or `status`: the retired super admin account and
 * approved applicant rows from the self-serve days were Organizer rows too, and
 * an owner session on any of them would have held `platform:manage` — every
 * client submission and all feedback — over an empty tenant of its own.
 *
 * The approval vocabulary this module used to carry (Pending / Rejected /
 * Suspended labels, the decisions on offer, the rejection note) went with the
 * approve and reject screens in ADMIN_MERGE_PLAN.md Batch 5. `status` stays a
 * plain string column, and **sign-in is still an allowlist**: `APPROVED` and
 * nothing else, so a status written by hand is refused, not let in.
 */

/**
 * Run As One's own Organizer row. It kept the id the development seed gave it
 * (`scripts/seed-dev.ts` uses the same one), which is also the id on
 * production.
 */
export const RUN_AS_ONE_ORGANIZER_ID = 'seed-crc-organizer';

/** The one status an organizer can be signed in to. */
export const SIGN_IN_STATUSES: readonly string[] = ['APPROVED'];

/**
 * Whether an organizer in this status may be signed in to, accept a staff
 * invitation, or have its staff sessions honoured. Anything not named in
 * SIGN_IN_STATUSES is refused — including a status this module has never
 * heard of.
 */
export function organizerCanSignIn(status: string): boolean {
  return SIGN_IN_STATUSES.includes(status);
}

/**
 * Whether this Organizer row may sign in with its own email and password, as
 * the owner. Only Run As One's row, and only while it is in a sign-in status.
 */
export function organizerOwnerCanSignIn(organizer: { id: string; status: string }): boolean {
  return organizer.id === RUN_AS_ONE_ORGANIZER_ID && organizerCanSignIn(organizer.status);
}
