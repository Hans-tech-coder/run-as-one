/**
 * The rules of an organizer's team: what state a member is in, and what makes
 * an invitation or a change of access valid.
 *
 * Free of Prisma and of node:crypto on purpose. The team screen's form checks
 * these rules before it posts and the routes check them again, so the sentence
 * under a field is the same one whichever side caught it (PROJECT_GUIDE §8,
 * rule 4). The invitation token and its email live in lib/team-invite.ts.
 *
 * Who may manage whom is not here — that is `GRANTABLE_ROLES` in
 * permissions.ts, read through `canManageMember` in actor.ts.
 */

import { invalidEmailMessage, looksLikeEmailAddress } from './email-address';
import { normalizeAccountEmail } from './text-case';
import {
  ROLE_LABELS,
  asEventRole,
  asMembershipRole,
  type EventRole,
  type MembershipRole,
} from './permissions';

/** Shared by the password route, the settings form and the invitation page. */
export const MIN_PASSWORD_LENGTH = 8;

export const MAX_NAME_LENGTH = 100;

/**
 * How long an invitation link works. A week: long enough for a volunteer who
 * reads their email the Monday after a race weekend, short enough that a link
 * left sitting in an inbox, or forwarded, stops being a way in.
 */
export const INVITE_TTL_DAYS = 7;

/** More races than any organizer runs in a season; bounds what one request writes. */
export const MAX_ASSIGNMENTS = 100;

export type FieldErrors = Record<string, string>;

// ── A member's state ───────────────────────────────────────────────────────

/**
 * Four states, derived rather than stored. `StaffMembership` holds the facts —
 * accepted when, suspended when, invitation expiring when — and a stored
 * status beside them would be a fifth fact that could disagree with the other
 * four.
 */
export type MemberState = 'ACTIVE' | 'INVITED' | 'EXPIRED' | 'SUSPENDED';

export const MEMBER_STATE_LABELS: Record<MemberState, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invited',
  EXPIRED: 'Invite Expired',
  SUSPENDED: 'Suspended',
};

/**
 * The status-badge tone for each (Admin.css). An invitation waiting on the
 * invitee needs nobody, so it is `pending`; one that expired will never be
 * accepted until somebody resends it, which is what `danger` is for; a
 * suspension is a decision already taken, so it reads as a neutral fact.
 */
export const MEMBER_STATE_TONES: Record<MemberState, 'success' | 'pending' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  INVITED: 'pending',
  EXPIRED: 'danger',
  SUSPENDED: 'neutral',
};

type Instant = Date | string | null;

export function memberState(
  member: {
    acceptedAt: Instant;
    suspendedAt: Instant;
    inviteExpiresAt: Instant;
    /** StaffAccount.status — the platform-wide switch. */
    accountStatus: string;
  },
  now = Date.now(),
): MemberState {
  if (member.suspendedAt || member.accountStatus === 'SUSPENDED') return 'SUSPENDED';
  if (member.acceptedAt) return 'ACTIVE';
  const expires = member.inviteExpiresAt ? new Date(member.inviteExpiresAt).getTime() : 0;
  return expires > now ? 'INVITED' : 'EXPIRED';
}

// ── What a person may reach ────────────────────────────────────────────────

export type AssignmentInput = { eventId: string; role: EventRole };

export type MemberAccess = {
  role: MembershipRole;
  /** Always empty for ADMIN, who reaches every event without one. */
  assignments: AssignmentInput[];
};

/** The key a refusal about one assignment row is filed under, for the form. */
export function assignmentField(index: number, part: 'event' | 'role'): string {
  return `assignments.${index}.${part}`;
}

/**
 * A role and its event assignments, as posted, checked against the events
 * this organizer actually runs.
 *
 * A STAFF membership must be given at least one event. Such a membership
 * reaches nothing until it has one, so an invitation without one would send
 * somebody to an empty dashboard wondering what they did wrong — and taking
 * every event away from a person who still has an account is what Suspend is
 * for.
 */
export function readAccess(
  rawRole: unknown,
  rawAssignments: unknown,
  eventIds: ReadonlySet<string>,
): { access: MemberAccess | null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const role = asMembershipRole(rawRole);

  if (!role) {
    errors.role = 'Choose whether this person is an Admin or Staff';
    return { access: null, errors };
  }

  if (role === 'ADMIN') {
    return { access: { role, assignments: [] }, errors };
  }

  const rows = Array.isArray(rawAssignments) ? rawAssignments : [];
  if (rows.length === 0) {
    errors.assignments =
      'Assign at least one event. A staff member reaches nothing until an event is theirs.';
    return { access: null, errors };
  }
  if (rows.length > MAX_ASSIGNMENTS) {
    errors.assignments = `Assign at most ${MAX_ASSIGNMENTS} events at a time`;
    return { access: null, errors };
  }

  const seen = new Set<string>();
  const assignments: AssignmentInput[] = [];

  rows.forEach((row, index) => {
    const entry = (row ?? {}) as { eventId?: unknown; role?: unknown };
    const eventId = typeof entry.eventId === 'string' ? entry.eventId : '';
    const eventRole = asEventRole(entry.role);

    if (!eventId) {
      errors[assignmentField(index, 'event')] = 'Choose the event this person will work on';
    } else if (!eventIds.has(eventId)) {
      // Worded as a missing event rather than someone else's, like every
      // other admin refusal about an id that is not this organizer's.
      errors[assignmentField(index, 'event')] = 'That event could not be found';
    } else if (seen.has(eventId)) {
      errors[assignmentField(index, 'event')] = 'This event is already assigned above';
    }

    if (!eventRole) {
      errors[assignmentField(index, 'role')] = 'Choose what they may do on this event';
    }

    if (eventId) seen.add(eventId);
    if (eventId && eventRole) assignments.push({ eventId, role: eventRole });
  });

  return Object.keys(errors).length > 0
    ? { access: null, errors }
    : { access: { role, assignments }, errors };
}

/** The person being invited: who they are and the address the link goes to. */
export function readInvitee(
  rawName: unknown,
  rawEmail: unknown,
): { name: string; email: string; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  // Lowercased like every account address in the app — see
  // normalizeAccountEmail in lib/text-case.ts for why this one is cased.
  const email = normalizeAccountEmail(rawEmail);

  if (!name) {
    errors.name = 'Enter the name of the person you are inviting';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Keep the name to ${MAX_NAME_LENGTH} characters or fewer`;
  }

  if (!email) {
    errors.email = 'Enter the email address the invitation should go to';
  } else if (!looksLikeEmailAddress(email)) {
    // One rule for every address in the app — see lib/email-address.ts.
    errors.email = invalidEmailMessage('ana@example.com');
  }

  return { name, email, errors };
}

/** A new password and its confirmation, as the invitation page asks for them. */
export function newPasswordErrors(password: unknown, confirmation: unknown): FieldErrors {
  const errors: FieldErrors = {};
  const value = typeof password === 'string' ? password : '';
  if (!value) {
    errors.password = 'Choose the password you will sign in with';
  } else if (value.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  } else if (confirmation !== value) {
    errors.confirmPassword = 'This does not match the password above';
  }
  return errors;
}

/**
 * "Staff on PINK RUN 2026 (Validator) and BIZRUN (Viewer)" — the sentence a
 * trail row and a toast use to say what someone may reach.
 */
export function describeAccess(access: MemberAccess, titleOf: (eventId: string) => string): string {
  if (access.role === 'ADMIN') return 'Admin on every event';
  const events = access.assignments.map(
    assignment => `${titleOf(assignment.eventId)} (${ROLE_LABELS[assignment.role]})`,
  );
  const list =
    events.length <= 1
      ? events.join('')
      : `${events.slice(0, -1).join(', ')} and ${events[events.length - 1]}`;
  return `Staff on ${list}`;
}
