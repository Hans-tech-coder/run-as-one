import React from 'react';
import type { FilterFn } from '@tanstack/react-table';
import { ROLE_LABELS, type EventRole, type TeamRole } from '@/lib/permissions';
import { MEMBER_STATE_LABELS, MEMBER_STATE_TONES, type MemberState } from '@/lib/team';

/**
 * What a team row shows, drawn once for the table cell and the card
 * (split out of TeamClient.tsx). Both layouts are on the page at once and CSS
 * picks one, so anything the two both say is said by one function here: they
 * cannot drift apart.
 */

export type TeamMemberRow = {
  /** The membership id, or "owner" for the organizer's own row. */
  id: string;
  isOwner: boolean;
  /** This row is the person looking at the screen. */
  isSelf: boolean;
  /** Decided on the server with the same canManageMember the routes enforce. */
  canManage: boolean;
  name: string;
  email: string;
  role: 'OWNER' | TeamRole;
  assignments: { eventId: string; eventTitle: string; role: EventRole }[];
  accepted: boolean;
  state: MemberState;
  inviteExpiresAt: string | null;
  lastLoginAt: string | null;
  /** Two-step sign-in is on — the marker, and the reset in the row menu. */
  twoFactorOn: boolean;
};

/** How many of a staff member's races the Events cell names before summarising. */
const EVENTS_SHOWN = 3;

export const MANILA = 'Asia/Manila';

/** "Sep 20" for an ISO instant, in the organizer's own time zone. */
function shortDay(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: MANILA, month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );
}

/** "Sep 13, 4:02 PM" — when somebody last signed in. */
function shortInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Name, address, and every race a person is on — the questions this box is asked. */
export const searchMembers: FilterFn<TeamMemberRow> = (row, _columnId, filterValue) => {
  const term = String(filterValue ?? '').trim().toLowerCase();
  if (!term) return true;
  const member = row.original;
  return [
    member.name,
    member.email,
    ROLE_LABELS[member.role],
    ...member.assignments.map(assignment => assignment.eventTitle),
  ]
    .join(' ')
    .toLowerCase()
    .includes(term);
};

export function YouChip() {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--ink-10)] px-2 py-0.5 text-[11px] font-semibold text-secondary">
      You
    </span>
  );
}

export function MemberEvents({ member }: { member: TeamMemberRow }) {
  if (member.role !== 'STAFF') {
    return <span className="text-secondary">Every event</span>;
  }
  const shown = member.assignments.slice(0, EVENTS_SHOWN);
  const more = member.assignments.length - shown.length;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1">
      {shown.map(assignment => (
        <li key={assignment.eventId} className="text-sm">
          <span className="text-primary">{assignment.eventTitle}</span>
          <span className="text-secondary whitespace-nowrap"> &middot; {ROLE_LABELS[assignment.role]}</span>
        </li>
      ))}
      {more > 0 && (
        <li className="text-xs text-secondary">{`+${more} more — open Edit Access to see them all`}</li>
      )}
    </ul>
  );
}

export function MemberStatus({ member }: { member: TeamMemberRow }) {
  return (
    <div>
      <span className={`status-badge ${MEMBER_STATE_TONES[member.state]}`}>
        {MEMBER_STATE_LABELS[member.state]}
      </span>
      {/* When a waiting invitation stops working — the one date an owner
          needs before it quietly becomes Invite Expired. */}
      {member.state === 'INVITED' && member.inviteExpiresAt && (
        <span className="status-note pending">{`Link expires ${shortDay(member.inviteExpiresAt)}`}</span>
      )}
    </div>
  );
}

export function LastSignIn({ member }: { member: TeamMemberRow }) {
  return member.lastLoginAt ? (
    <span className="whitespace-nowrap">{shortInstant(member.lastLoginAt)}</span>
  ) : member.isOwner ? (
    // The Organizer row only began recording sign-ins in SETTINGS_PLAN.md
    // Batch 3, so until its next sign-in a blank is honest where "Never"
    // would be false.
    <span className="text-secondary">&mdash;</span>
  ) : (
    <span className="text-secondary">Never</span>
  );
}

/**
 * Why a row has no menu. The table gives it as a hover title on the dash; a
 * card says it in words, because a touch screen never hovers.
 */
export function manageReason(member: TeamMemberRow): string {
  if (member.isOwner) return "The Super Admin is Run As One's own account";
  if (member.isSelf) return 'You cannot change your own access';
  return 'Only the Super Admin can change an Admin';
}
