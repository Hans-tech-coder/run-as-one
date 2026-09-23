import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MailQuestion, UserX, Users } from 'lucide-react';
import prisma from '@/lib/db';
import { can, canManageMember, grantableRoles, requireTeamActor } from '@/lib/actor';
import { TEAM_ROLES, asEventRole, asTeamRole } from '@/lib/permissions';
import { memberState } from '@/lib/team';
import { soonestFirst } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import TeamClient, { type TeamMemberRow } from './TeamClient';
import RolesPanel from './RolesPanel';
import DashboardHeader from '@/app/admin/DashboardHeader';

export const metadata: Metadata = {
  title: `Team | ${SITE_NAME} Admin`,
};

/**
 * The people who can sign in to this organizer's admin, and what each of them
 * may reach (STAFF_ACCESS_PLAN.md, Batch 2).
 *
 * Only a role holding `team:manage` has this screen; anybody else is given the
 * admin's own 404, the same answer as a page that does not exist.
 *
 * **The owner is the first row and has no menu.** The owner is the Organizer
 * row itself, not a membership (§1.1), so there is nothing to suspend or
 * remove — but a list of "who can get in" that left out the one account that
 * can do everything would be the wrong list.
 *
 * **The order is invitation order and holds.** Suspending, resending or
 * editing a person never moves their row, for the reason every list in the
 * admin gives: somebody working down it must not lose their place (§9).
 *
 * What each row may do is decided here, with the same `canManageMember` the
 * routes enforce, so the menu is only offered where the route would agree.
 */
export default async function TeamPage() {
  const actor = await requireTeamActor();

  if (!can(actor, 'team:manage', { organizerId: actor.orgId })) {
    notFound();
  }

  const [organizer, memberships, events] = await Promise.all([
    prisma.organizer.findUnique({
      where: { id: actor.orgId },
      select: { name: true, email: true, lastLoginAt: true },
    }),
    prisma.staffMembership.findMany({
      // A client viewer holds a membership too, but is not on the team.
      where: { organizerId: actor.orgId, role: { in: [...TEAM_ROLES] } },
      orderBy: [{ invitedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        role: true,
        staffId: true,
        acceptedAt: true,
        suspendedAt: true,
        inviteExpiresAt: true,
        staff: { select: { name: true, email: true, status: true, lastLoginAt: true } },
        assignments: {
          orderBy: { createdAt: 'asc' },
          select: { eventId: true, role: true, event: { select: { title: true } } },
        },
      },
    }),
    // Every race the organizer runs, finished ones included — a validator may
    // be brought on to settle the last orders of a race already run. Soonest
    // first, because the race being staffed is almost always the next one.
    prisma.event.findMany({
      where: { organizerId: actor.orgId },
      orderBy: soonestFirst,
      select: { id: true, title: true, date: true },
    }),
  ]);

  if (!organizer) {
    notFound();
  }

  const members: TeamMemberRow[] = memberships.map(membership => {
    const role = asTeamRole(membership.role) ?? 'STAFF';
    const isSelf = actor.kind === 'STAFF' && membership.staffId === actor.id;
    return {
      id: membership.id,
      isOwner: false,
      isSelf,
      canManage: !isSelf && canManageMember(actor, role),
      name: membership.staff.name,
      email: membership.staff.email,
      role,
      assignments:
        role === 'ADMIN'
          ? []
          : membership.assignments.flatMap(assignment => {
              const eventRole = asEventRole(assignment.role);
              return eventRole
                ? [{ eventId: assignment.eventId, eventTitle: assignment.event.title, role: eventRole }]
                : [];
            }),
      accepted: Boolean(membership.acceptedAt),
      state: memberState({
        acceptedAt: membership.acceptedAt,
        suspendedAt: membership.suspendedAt,
        inviteExpiresAt: membership.inviteExpiresAt,
        accountStatus: membership.staff.status,
      }),
      inviteExpiresAt: membership.inviteExpiresAt?.toISOString() ?? null,
      lastLoginAt: membership.staff.lastLoginAt?.toISOString() ?? null,
    };
  });

  const rows: TeamMemberRow[] = [
    {
      id: 'owner',
      isOwner: true,
      isSelf: actor.kind !== 'STAFF',
      canManage: false,
      name: organizer.name,
      email: organizer.email,
      role: 'OWNER',
      assignments: [],
      accepted: true,
      state: 'ACTIVE',
      inviteExpiresAt: null,
      lastLoginAt: organizer.lastLoginAt?.toISOString() ?? null,
    },
    ...members,
  ];

  const active = members.filter(member => member.state === 'ACTIVE').length;
  const waiting = members.filter(member => member.state === 'INVITED' || member.state === 'EXPIRED').length;
  const suspended = members.filter(member => member.state === 'SUSPENDED').length;

  return (
    <>
      <DashboardHeader title="Team" />

      <div className="admin-content">
        <div className="metrics-grid mb-8">
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Active Members</span>
              <div className="metric-icon"><Users size={20} /></div>
            </div>
            <div className="metric-value">{active}</div>
          </div>
          {/* Expired invitations are counted here too: they are still people
              somebody meant to bring on, and each one needs a resend. */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Invitations Waiting</span>
              <div className="metric-icon"><MailQuestion size={20} /></div>
            </div>
            <div className="metric-value">{waiting}</div>
          </div>
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Suspended</span>
              <div className="metric-icon"><UserX size={20} /></div>
            </div>
            <div className="metric-value">{suspended}</div>
          </div>
        </div>

        <TeamClient
          organizerName={organizer.name}
          rows={rows}
          events={events}
          grantableRoles={grantableRoles(actor)}
        />

        <RolesPanel />
      </div>
    </>
  );
}
