/**
 * Who is acting in the admin, and what they may reach.
 *
 * An organizer is a company, not a person. Until staff accounts existed the
 * `Organizer` row was both — it owned the events and held the one login
 * everybody on the team shared — so every admin route asked
 * `event.organizerId !== auth.id` and every change was recorded as "the
 * organizer did it". The one sentence this module exists to hold:
 *
 * > **Authorisation scopes by `orgId`. Attribution records the actor's `id`.**
 *
 * For an owner `id === orgId`, which is why moving every admin surface onto
 * this module is invisible until a staff member signs in.
 *
 * - `getActor()` is for route handlers, which answer a missing session with
 *   their own 401. `requireActor()` is for server pages, which redirect to the
 *   sign-in screen instead.
 * - `can(actor, permission, { organizerId, eventId })` is the check a route
 *   makes before it acts. **No route compares a role string** — the matrix is
 *   lib/permissions.ts.
 * - `reachableEvents(actor, permission)` is the `where` a list page reads
 *   events through, so a STAFF member's lists hold only the races assigned to
 *   them.
 * - A **client viewer** (a `VIEWER` membership, ADMIN_MERGE_PLAN.md) carries
 *   its `clientId` on the actor. It holds `VIEWER_PERMISSIONS` and nothing
 *   else, only on events whose `clientId` is its own: `reachableEvents` adds
 *   the client to the `where`, and `can()` refuses unless the caller passes
 *   the event's `clientId` and it matches. Forgetting to pass it fails closed.
 *
 * An owner's session is read from the token alone, exactly as the routes did
 * before: nothing about an owner's reach can change mid-session that the
 * routes did not already ignore. The one thing asked of it is that it is Run
 * As One's own row (`RUN_AS_ONE_ORGANIZER_ID`, organizer-status.ts) — no other
 * Organizer row signs in, so a token for one is dead on arrival. A **staff** session is checked against the
 * record on every request — status, membership, assignments, the organizer's
 * own status (`organizerCanSignIn`, an allowlist) and
 * `sessionsValidFrom` — because a suspension that waits a day for the JWT to
 * expire is not a suspension.
 */

import { forbidden, redirect } from 'next/navigation';
import type { Organizer, Prisma, StaffAccount } from '@prisma/client';
import prisma from './db';
import { getAuthCookie } from './auth';
import type { SessionClaims, SessionKind } from './jwt';
import { normalizeAccountEmail } from './text-case';
import {
  RUN_AS_ONE_ORGANIZER_ID,
  SIGN_IN_STATUSES,
  organizerCanSignIn,
} from './organizer-status';
import { VIEWER_SIGN_IN_STATUSES, clientViewersCanSignIn } from './client';
import {
  TEAM_ROLES,
  VIEWER_PERMISSIONS,
  asEventRole,
  asMembershipRole,
  roleCan,
  roleCanGrant,
  type EventRole,
  type MembershipRole,
  type OrgRole,
  type Permission,
  type TeamRole,
} from './permissions';

export type ActorRole = 'OWNER' | MembershipRole;

export type Actor = {
  /** The person: an Organizer id for OWNER, a StaffAccount id for STAFF. */
  id: string;
  kind: SessionKind;
  /** The tenant — the Organizer whose events and promotions this session reaches. */
  orgId: string;
  role: ActorRole;
  name: string;
  email: string;
  /**
   * The role held on each assigned event. Only a STAFF membership has any;
   * OWNER and ADMIN reach every event of their organizer without one.
   */
  assignments: ReadonlyMap<string, EventRole>;
  /** The client a VIEWER membership sees, and null for every other actor. */
  clientId: string | null;
};

const NO_ASSIGNMENTS: ReadonlyMap<string, EventRole> = new Map();

export async function getActor(): Promise<Actor | null> {
  const session = await getAuthCookie();
  if (!session) return null;

  if (session.kind !== 'STAFF') {
    // An owner is their own tenant, and the only owner is Run As One; a token
    // saying otherwise was not issued by this app, or was issued to an account
    // that has since been retired.
    if (session.sub !== session.orgId || session.sub !== RUN_AS_ONE_ORGANIZER_ID) return null;
    return {
      id: session.sub,
      kind: session.kind,
      orgId: session.orgId,
      role: session.kind,
      name: session.name,
      email: session.email,
      assignments: NO_ASSIGNMENTS,
      clientId: null,
    };
  }

  const membership = await prisma.staffMembership.findUnique({
    where: { staffId_organizerId: { staffId: session.sub, organizerId: session.orgId } },
    select: {
      role: true,
      acceptedAt: true,
      suspendedAt: true,
      clientId: true,
      client: { select: { status: true } },
      staff: { select: { name: true, email: true, status: true, sessionsValidFrom: true } },
      organizer: { select: { status: true } },
      assignments: { select: { eventId: true, role: true } },
    },
  });

  // Removed from the team, never accepted, suspended, or the organizer itself
  // no longer approved: each of those ends the session now rather than at
  // expiry. The organizer check is an allowlist (organizer-status.ts), so a
  // status added later is refused until somebody decides otherwise.
  if (!membership?.acceptedAt) return null;
  if (membership.suspendedAt) return null;
  if (membership.staff.status !== 'ACTIVE') return null;
  if (!organizerCanSignIn(membership.organizer.status)) return null;

  // "Sign out everywhere", a password change and a suspension all move this
  // instant forward; every token issued before it is dead.
  if (
    session.iat === null ||
    session.iat * 1000 < membership.staff.sessionsValidFrom.getTime()
  ) {
    return null;
  }

  const role = asMembershipRole(membership.role);
  if (!role) return null;

  // A client viewer needs a client, and a client whose viewers may sign in
  // (client.ts, an allowlist): archiving a client ends its viewers' sessions
  // on their next request. A clientId on any other membership is ignored.
  let clientId: string | null = null;
  if (role === 'VIEWER') {
    if (!membership.clientId || !membership.client) return null;
    if (!clientViewersCanSignIn(membership.client.status)) return null;
    clientId = membership.clientId;
  }

  const assignments = new Map<string, EventRole>();
  if (role === 'STAFF') {
    for (const assignment of membership.assignments) {
      const eventRole = asEventRole(assignment.role);
      if (eventRole) assignments.set(assignment.eventId, eventRole);
    }
  }

  return {
    id: session.sub,
    kind: 'STAFF',
    orgId: session.orgId,
    role,
    name: membership.staff.name,
    email: membership.staff.email,
    assignments,
    clientId,
  };
}

/** For server pages: the actor, or off to the sign-in screen. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect('/admin/login');
  return actor;
}

/**
 * For every dashboard page that is Run As One's team's work — events,
 * registrants, results, marketing, clients, communities, feedback, team,
 * activity: the actor, or the not-allowed page for a client viewer.
 *
 * A viewer's own screens are the Overview and its account settings
 * (ADMIN_MERGE_PLAN.md, Batch 4). Anywhere else answers with `forbidden()`,
 * which renders `admin/forbidden.tsx` inside the sidebar with a 403, rather
 * than the empty lists and "not found" each page's own `can()` would give it.
 * It is asked **before** a page reads anything, so the answer is the same for
 * every id in the URL and says nothing about which races exist. The pages'
 * own checks still follow, and every API route refuses a viewer by `can()`.
 */
export async function requireTeamActor(): Promise<Actor> {
  const actor = await requireActor();
  if (isClientViewer(actor)) forbidden();
  return actor;
}

/**
 * The organizer-wide role an actor holds, or null for a STAFF membership that
 * reaches only its assigned events, and for a client viewer.
 */
function orgRole(actor: Actor): OrgRole | null {
  if (actor.role === 'OWNER') return 'OWNER';
  if (actor.role === 'ADMIN') return 'ADMIN';
  return null;
}

/**
 * Whether this actor may invite, change, suspend or remove a membership that
 * holds `role`. A change of role asks twice — about the membership as it is
 * and as it would be — so an admin can neither touch an admin nor make one.
 * `team:manage` says they run the team; `GRANTABLE_ROLES` says how far.
 */
export function canManageMember(actor: Actor, role: TeamRole): boolean {
  const wide = orgRole(actor);
  return wide !== null && roleCan(wide, 'team:manage') && roleCanGrant(wide, role);
}

/** The roles this actor may hand out, in the order the team screen offers them. */
export function grantableRoles(actor: Actor): TeamRole[] {
  return TEAM_ROLES.filter(role => canManageMember(actor, role));
}

/**
 * The memberships a staff member can be signed in to right now: accepted, not
 * suspended by that organizer, inside an organizer that is itself approved, and
 * — for a client viewer — on a client whose viewers may sign in.
 * Sign-in reads through this, so it can never open a membership `getActor()`
 * would refuse on the next request. (The organizer switcher and the sidebar
 * read it too, until the single tenant of ADMIN_MERGE_PLAN.md retired the
 * switcher.)
 */
export function activeMembershipWhere(staffId: string): Prisma.StaffMembershipWhereInput {
  return {
    staffId,
    acceptedAt: { not: null },
    suspendedAt: null,
    organizer: { status: { in: [...SIGN_IN_STATUSES] } },
    // A client viewer also needs its client, in a status whose viewers may
    // sign in — the same two checks getActor() makes.
    OR: [
      { role: { not: 'VIEWER' } },
      { clientId: { not: null }, client: { status: { in: [...VIEWER_SIGN_IN_STATUSES] } } },
    ],
  };
}

/**
 * Where an action lands: whose organizer, which race when it is about one, and
 * — for a check a client viewer may pass — that race's `clientId`.
 */
export type Reach = { organizerId: string; eventId?: string | null; clientId?: string | null };

/** A client's own sign-in (a VIEWER membership), as opposed to Run As One's team. */
export function isClientViewer(actor: Actor): boolean {
  return actor.kind === 'STAFF' && actor.role === 'VIEWER';
}

/**
 * Whether this actor may do this, here.
 *
 * Organizer-wide permissions (creating an event, managing promotions) take no
 * `eventId`, and a STAFF membership never holds them. Event permissions need
 * the event, because a STAFF member's role is per race.
 */
export function can(actor: Actor, permission: Permission, reach: Reach): boolean {
  // Nobody reaches into another organizer's data. The retired super admin
  // could settle another organizer's order from here; with one tenant there is
  // no other organizer's data to reach.
  if (reach.organizerId !== actor.orgId) return false;

  // A client viewer: its one permission, on one event, of its own client.
  if (isClientViewer(actor)) {
    return (
      VIEWER_PERMISSIONS.includes(permission) &&
      Boolean(reach.eventId) &&
      actor.clientId !== null &&
      reach.clientId === actor.clientId
    );
  }

  const wide = orgRole(actor);
  if (wide) return roleCan(wide, permission);

  if (!reach.eventId) return false;
  const eventRole = actor.assignments.get(reach.eventId);
  return eventRole !== undefined && roleCan(eventRole, permission);
}

/**
 * Whether this actor holds a permission on at least one race — for a screen
 * that is not about any single event, like the marketing page or the image
 * uploader both event forms share.
 */
export function canSomewhere(actor: Actor, permission: Permission): boolean {
  if (isClientViewer(actor)) return VIEWER_PERMISSIONS.includes(permission);
  const wide = orgRole(actor);
  if (wide) return roleCan(wide, permission);
  for (const eventRole of actor.assignments.values()) {
    if (roleCan(eventRole, permission)) return true;
  }
  return false;
}

/**
 * The events a list page may show this actor. For an owner it is exactly the
 * `{ organizerId }` every list read before; for a client viewer, its client's
 * events — and none at all for any permission it does not hold, which is what
 * every existing list page (reading `event:view`) now shows it.
 */
export function reachableEvents(
  actor: Actor,
  permission: Permission = 'event:view',
): Prisma.EventWhereInput {
  if (isClientViewer(actor)) {
    return actor.clientId && VIEWER_PERMISSIONS.includes(permission)
      ? { organizerId: actor.orgId, clientId: actor.clientId }
      : { id: { in: [] } };
  }
  const wide = orgRole(actor);
  if (wide) {
    return roleCan(wide, permission) ? { organizerId: actor.orgId } : { id: { in: [] } };
  }
  const ids = [...actor.assignments]
    .filter(([, eventRole]) => roleCan(eventRole, permission))
    .map(([eventId]) => eventId);
  return { organizerId: actor.orgId, id: { in: ids } };
}

// ── Accounts ───────────────────────────────────────────────────────────────

export type AccountByEmail =
  | { kind: 'ORGANIZER'; organizer: Organizer }
  | { kind: 'STAFF'; staff: StaffAccount };

/**
 * Which account an address belongs to — the one lookup sign-in, organizer
 * registration and the profile screen all make, so the two account tables can
 * never disagree about who owns an address.
 *
 * Nothing in the database stops the same address sitting in both tables, so
 * this is where that is decided: the Organizer row wins, because it is the
 * older login and the one an owner already uses. Every write of an account
 * email checks here first, so the tie only arises from a row written by hand.
 *
 * The address is normalised here as well as at the door — see
 * normalizeAccountEmail in lib/text-case.ts.
 */
export async function findAccountByEmail(email: unknown): Promise<AccountByEmail | null> {
  const address = normalizeAccountEmail(email);
  if (!address) return null;

  const organizer = await prisma.organizer.findUnique({ where: { email: address } });
  if (organizer) return { kind: 'ORGANIZER', organizer };

  const staff = await prisma.staffAccount.findUnique({ where: { email: address } });
  return staff ? { kind: 'STAFF', staff } : null;
}

/** The session Run As One's Organizer row signs in to, as its owner. */
export function organizerSessionClaims(
  organizer: Pick<Organizer, 'id' | 'email' | 'name'>,
): SessionClaims {
  return {
    sub: organizer.id,
    kind: 'OWNER',
    orgId: organizer.id,
    role: 'OWNER',
    name: organizer.name,
    email: organizer.email,
  };
}

/** The session a staff member signs in to, inside one of their memberships. */
export function staffSessionClaims(
  staff: Pick<StaffAccount, 'id' | 'email' | 'name'>,
  membership: { organizerId: string; role: string },
): SessionClaims {
  return {
    sub: staff.id,
    kind: 'STAFF',
    orgId: membership.organizerId,
    role: asMembershipRole(membership.role) ?? 'STAFF',
    name: staff.name,
    email: staff.email,
  };
}
