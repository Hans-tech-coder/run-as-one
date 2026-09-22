/**
 * Who may do what inside an organizer's admin — the whole matrix, in one file.
 *
 * Permissions are verbs, and **no route compares a role string**. A role
 * checked in two places drifts in two directions; a table in one file can be
 * read in one sitting, and changing what a VALIDATOR may do is one edit here
 * rather than a hunt through every route. Routes ask `can()` in `actor.ts`,
 * which reads this table.
 *
 * Two kinds of role, because two kinds of reach:
 *
 * - **OWNER** and **ADMIN** are organizer-wide. They need no assignments.
 * - **EVENT_MANAGER**, **VALIDATOR**, **ENCODER** and **VIEWER** are held on
 *   one event at a time (`EventAssignment.role`). A membership whose role is
 *   STAFF reaches nothing until an event is assigned to it, and the same person
 *   can be a validator on one race and only a viewer on another.
 *
 * Note what VALIDATOR deliberately lacks: `registration:edit` and
 * `registration:delete`. That separation is the point of the role — if the
 * person who settles an order can also rewrite it, an argument about an order
 * becomes an argument about the data.
 *
 * A third kind arrived with ADMIN_MERGE_PLAN.md: a **client viewer** — an
 * organization Run As One runs races for, signed in to see that its races
 * exist and how many runners have registered. It is a membership role
 * (`VIEWER`), not a staff role, and it holds exactly `VIEWER_PERMISSIONS`,
 * scoped to its own client's events by `can()` and `reachableEvents()` in
 * `actor.ts`. It is never offered on the team screen: `TEAM_ROLES` is what
 * the team form, its routes and the matrix read.
 *
 * Deliberately free of Prisma, so the team screen can import it to render the
 * same matrix it enforces. See STAFF_ACCESS_PLAN.md §3.
 */

export const PERMISSIONS = [
  'event:view',
  /** Registrant counts only — total, per category, paid vs pending. No money, no names. */
  'event:view-summary',
  'event:create',
  'event:edit',
  'event:delete',
  'registration:view',
  'registration:validate',
  'registration:remark',
  'registration:email',
  'registration:edit',
  'registration:delete',
  'proof:view',
  'results:manage',
  'promo:view',
  'promo:manage',
  /**
   * Waiving Run As One's admin fee on a pacer's free entry
   * (`PACER_DISCOUNT_PLAN.md`). `OWNER` alone, because the admin fee is Run As
   * One's own money (`settlement.ts`): an organizer's admin may give away the
   * organizer's entry — that is what `promo:manage` is — but not the
   * platform's commission on it.
   *
   * **Deliberately not `org:settings`.** That verb means "set the default
   * platform fee", and it happens to be OWNER-only today; a route that
   * borrowed it would break the moment the owner decided an admin may set
   * default fees, and it would be checking the wrong question in the meantime.
   * Routes check verbs, never role names, so a new decision needs a new verb.
   */
  'promo:waive-fee',
  'team:manage',
  'org:settings',
  'activity:view',
  /**
   * Run As One's own work that belongs to no race: client submissions,
   * the shared club list, the feedback inbox and the platform fees collected.
   * It was the super admin's screen set until the two dashboards merged
   * (ADMIN_MERGE_PLAN.md, Batch 2).
   */
  'platform:manage',
  /**
   * What Run As One owes each race's organizer and what it has paid them
   * (ADMIN_MERGE_PLAN.md, Batch 6): the settlement screen and recording or
   * voiding a remittance. Separate from `platform:manage` because it is money
   * leaving the company, which the owner may one day want narrower than clubs
   * and feedback.
   */
  'remittance:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** The roles that reach every event of their organizer. */
export const ORG_ROLES = ['OWNER', 'ADMIN'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** The roles a STAFF membership holds on one assigned event. */
export const EVENT_ROLES = ['EVENT_MANAGER', 'VALIDATOR', 'ENCODER', 'VIEWER'] as const;
export type EventRole = (typeof EVENT_ROLES)[number];

export type Role = OrgRole | EventRole;

/**
 * The membership roles a person on Run As One's own team can hold — what the
 * team screen offers, manages and draws. A client viewer is not one of them.
 */
export const TEAM_ROLES = ['ADMIN', 'STAFF'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/**
 * What `StaffMembership.role` may hold: the team roles, plus `VIEWER` for a
 * client's own sign-in (a membership that also carries `clientId`). OWNER is
 * not in it: the owner is the Organizer row itself and never a membership, so
 * a membership claiming to be one is a bug, not a promotion.
 */
export const MEMBERSHIP_ROLES = [...TEAM_ROLES, 'VIEWER'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/**
 * Everything a client viewer may do. One verb, on purpose: the owner's answer
 * is that an organizer sees its races and their registrant counts, and nothing
 * that costs a runner privacy or Run As One its books. Anything not listed is
 * refused by `can()`, including a permission added to PERMISSIONS later.
 */
export const VIEWER_PERMISSIONS: readonly Permission[] = ['event:view-summary'];

/**
 * Which membership roles each organizer-wide role may hand out, change or take
 * away. An ADMIN runs the team but can neither make another ADMIN nor touch
 * one: otherwise the owner's decision about who reaches every event is one an
 * admin could quietly widen — or undo, by suspending the admin the owner chose.
 * Organizer-wide reach is the owner's alone to grant.
 */
export const GRANTABLE_ROLES: Record<OrgRole, readonly TeamRole[]> = {
  OWNER: ['ADMIN', 'STAFF'],
  ADMIN: ['STAFF'],
};

export function roleCanGrant(granter: OrgRole, role: TeamRole): boolean {
  return GRANTABLE_ROLES[granter].includes(role);
}

const ALL: readonly Role[] = ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'VALIDATOR', 'ENCODER', 'VIEWER'];

/** The matrix's columns, in the order the team screen draws them. */
export const MATRIX_ROLES = ALL;

/**
 * The matrix's rows as the team screen draws them. `event:view-summary` is
 * left out: every role that sees an event already sees more than its counts,
 * so the row would be a column of ticks that says nothing about staff.
 */
export const MATRIX_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  permission => permission !== 'event:view-summary',
);

/** What the team screen calls each role. */
export const ROLE_LABELS: Record<Role | MembershipRole, string> = {
  // Run As One's own account. Shown as Super Admin at the owner's request:
  // there is one tenant, and its owner is the platform's top account.
  OWNER: 'Super Admin',
  ADMIN: 'Admin',
  STAFF: 'Staff',
  EVENT_MANAGER: 'Event Manager',
  VALIDATOR: 'Validator',
  ENCODER: 'Encoder',
  VIEWER: 'Viewer',
};

/**
 * The sentence under each role in the pickers. Written from the matrix below
 * and kept beside it, so a change to what a role may do is one screen away
 * from the words that describe it.
 */
export const ROLE_HINTS: Record<Role | MembershipRole, string> = {
  OWNER: "Run As One's own account. Every event, every setting, and the only account that can waive the admin fee on a pacer's entry.",
  ADMIN: "Every event, the team, client submissions, clubs, feedback and remittances. Cannot delete an event, change organizer settings, or waive Run As One's admin fee on a pacer's entry.",
  STAFF: 'Only the events you assign, with a role on each.',
  EVENT_MANAGER: 'Runs the event: edits it, settles payments, edits runners and loads results. Cannot remove a runner.',
  VALIDATOR: 'Checks payment proofs and settles orders. Cannot edit or remove a runner.',
  ENCODER: 'Loads the results sheet and reads registrants. Cannot settle an order.',
  VIEWER: 'Sees the event, its registrants and its promotions. Changes nothing.',
};

/**
 * The membership VIEWER and the per-event VIEWER share a key in the two
 * records above, and the team screen means the per-event one. A client
 * viewer is described here instead.
 */
export const CLIENT_VIEWER_LABEL = 'Client Viewer';
export const CLIENT_VIEWER_HINT =
  "Sees its own organization's events and how many runners have registered. Changes nothing.";

/** Each permission as the team screen's role table words it. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'event:view': 'See the event',
  'event:view-summary': 'See registrant counts',
  'event:create': 'Create events',
  'event:edit': 'Edit the event',
  'event:delete': 'Delete an event',
  'registration:view': 'See registrants',
  'registration:validate': 'Validate payments',
  'registration:remark': 'Write payment remarks',
  'registration:email': 'Send a missing email by hand',
  'registration:edit': 'Edit a runner',
  'registration:delete': 'Remove a runner',
  'proof:view': 'Open payment proofs',
  'results:manage': 'Upload results',
  'promo:view': 'See promotions',
  'promo:manage': 'Create and change promotions',
  'promo:waive-fee': "Waive Run As One's admin fee",
  'team:manage': 'Manage the team',
  'org:settings': 'Set the default platform fee',
  'activity:view': 'Read the activity trail',
  'platform:manage': 'Clients, clubs, feedback and fees',
  'remittance:manage': 'Record remittances to organizers',
};

/** STAFF_ACCESS_PLAN.md §3, as data. */
const MATRIX: Record<Permission, readonly Role[]> = {
  'event:view': ALL,
  'event:view-summary': ALL,
  'event:create': ['OWNER', 'ADMIN'],
  'event:edit': ['OWNER', 'ADMIN', 'EVENT_MANAGER'],
  'event:delete': ['OWNER'],
  'registration:view': ALL,
  'registration:validate': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'VALIDATOR'],
  'registration:remark': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'VALIDATOR'],
  'registration:email': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'VALIDATOR'],
  'registration:edit': ['OWNER', 'ADMIN', 'EVENT_MANAGER'],
  'registration:delete': ['OWNER', 'ADMIN'],
  'proof:view': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'VALIDATOR'],
  'results:manage': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'ENCODER'],
  'promo:view': ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'VIEWER'],
  'promo:manage': ['OWNER', 'ADMIN'],
  'promo:waive-fee': ['OWNER'],
  'team:manage': ['OWNER', 'ADMIN'],
  'org:settings': ['OWNER'],
  'activity:view': ['OWNER', 'ADMIN'],
  'platform:manage': ['OWNER', 'ADMIN'],
  'remittance:manage': ['OWNER', 'ADMIN'],
};

export function roleCan(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}

export function asMembershipRole(value: unknown): MembershipRole | null {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (MEMBERSHIP_ROLES as readonly string[]).includes(role) ? (role as MembershipRole) : null;
}

/** A team role (ADMIN or STAFF) — never a client viewer. */
export function asTeamRole(value: unknown): TeamRole | null {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (TEAM_ROLES as readonly string[]).includes(role) ? (role as TeamRole) : null;
}

export function asEventRole(value: unknown): EventRole | null {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (EVENT_ROLES as readonly string[]).includes(role) ? (role as EventRole) : null;
}
