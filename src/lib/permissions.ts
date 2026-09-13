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
 * Deliberately free of Prisma, so the team screen can import it to render the
 * same matrix it enforces. See STAFF_ACCESS_PLAN.md §3.
 */

export const PERMISSIONS = [
  'event:view',
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
  'team:manage',
  'org:settings',
  'activity:view',
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
 * What `StaffMembership.role` may hold. OWNER is not in it: the owner is the
 * Organizer row itself and never a membership, so a membership claiming to be
 * one is a bug, not a promotion.
 */
export const MEMBERSHIP_ROLES = ['ADMIN', 'STAFF'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/**
 * Which membership roles each organizer-wide role may hand out, change or take
 * away. An ADMIN runs the team but can neither make another ADMIN nor touch
 * one: otherwise the owner's decision about who reaches every event is one an
 * admin could quietly widen — or undo, by suspending the admin the owner chose.
 * Organizer-wide reach is the owner's alone to grant.
 */
export const GRANTABLE_ROLES: Record<OrgRole, readonly MembershipRole[]> = {
  OWNER: ['ADMIN', 'STAFF'],
  ADMIN: ['STAFF'],
};

export function roleCanGrant(granter: OrgRole, role: MembershipRole): boolean {
  return GRANTABLE_ROLES[granter].includes(role);
}

const ALL: readonly Role[] = ['OWNER', 'ADMIN', 'EVENT_MANAGER', 'VALIDATOR', 'ENCODER', 'VIEWER'];

/** The matrix's columns, in the order the team screen draws them. */
export const MATRIX_ROLES = ALL;

/** What the team screen calls each role. */
export const ROLE_LABELS: Record<Role | MembershipRole, string> = {
  OWNER: 'Owner',
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
  OWNER: 'The organizer account itself. Every event and every setting.',
  ADMIN: 'Every event this organizer runs, and the team. Cannot delete an event or change organizer settings.',
  STAFF: 'Only the events you assign, with a role on each.',
  EVENT_MANAGER: 'Runs the event: edits it, settles payments, edits runners and loads results. Cannot remove a runner.',
  VALIDATOR: 'Checks payment proofs and settles orders. Cannot edit or remove a runner.',
  ENCODER: 'Loads the results sheet and reads registrants. Cannot settle an order.',
  VIEWER: 'Sees the event, its registrants and its promotions. Changes nothing.',
};

/** Each permission as the team screen's role table words it. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'event:view': 'See the event',
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
  'team:manage': 'Manage the team',
  'org:settings': 'Organizer settings',
  'activity:view': 'Read the activity trail',
};

/** STAFF_ACCESS_PLAN.md §3, as data. */
const MATRIX: Record<Permission, readonly Role[]> = {
  'event:view': ALL,
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
  'team:manage': ['OWNER', 'ADMIN'],
  'org:settings': ['OWNER'],
  'activity:view': ['OWNER', 'ADMIN'],
};

export function roleCan(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}

/**
 * What a super admin may do inside another organizer's data from the admin
 * API: read and settle a registration, and open its proof. That is exactly the
 * reach the status, email and proof routes gave `SUPER_ADMIN` before this
 * module existed — the platform owner is who an organizer calls about a stuck
 * payment. Everything else (editing a runner, deleting an event, touching a
 * promotion) stays the organizer's own; the runner and event-delete routes
 * spelled the role `SUPERADMIN`, so their super admin branch never matched and
 * this keeps what they actually did rather than what they seemed to intend.
 */
export const SUPER_ADMIN_REACH: readonly Permission[] = [
  'registration:view',
  'registration:validate',
  'registration:remark',
  'registration:email',
  'proof:view',
];

export function asMembershipRole(value: unknown): MembershipRole | null {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (MEMBERSHIP_ROLES as readonly string[]).includes(role) ? (role as MembershipRole) : null;
}

export function asEventRole(value: unknown): EventRole | null {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (EVENT_ROLES as readonly string[]).includes(role) ? (role as EventRole) : null;
}
