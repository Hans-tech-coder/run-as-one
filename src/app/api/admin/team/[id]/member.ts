import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, canManageMember, getActor, type Actor } from '@/lib/actor';
import { asEventRole, asMembershipRole } from '@/lib/permissions';
import type { MemberAccess } from '@/lib/team';

/**
 * The checks every route about one team member makes, in one place, so the
 * change, the suspension, the removal and the resend cannot disagree about who
 * may touch whom.
 *
 * 1. A session, holding `team:manage` in this organizer.
 * 2. A membership of **this** organizer — an id from the browser is not proof
 *    of ownership, and a miss reads "Team member not found." whether the id is
 *    somebody else's or nobody's.
 * 3. Not the actor's own membership. Nobody changes, suspends or removes
 *    themselves: an admin could otherwise widen their own events, and a
 *    self-suspension locks a person out with nobody noticing why.
 * 4. A membership whose role this actor may manage — an admin cannot touch
 *    another admin (GRANTABLE_ROLES in permissions.ts).
 */
export async function loadManagedMember(id: string): Promise<
  | { ok: true; actor: Actor; member: ManagedMember }
  | { ok: false; response: NextResponse }
> {
  const actor = await getActor();
  if (!actor) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!can(actor, 'team:manage', { organizerId: actor.orgId })) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'You do not have access to manage this team.' }, { status: 403 }),
    };
  }

  const member = await prisma.staffMembership.findFirst({
    where: { id, organizerId: actor.orgId },
    select: {
      id: true,
      role: true,
      staffId: true,
      acceptedAt: true,
      suspendedAt: true,
      staff: { select: { name: true, email: true, password: true } },
      assignments: {
        orderBy: { createdAt: 'asc' },
        select: { eventId: true, role: true, event: { select: { title: true } } },
      },
    },
  });

  if (!member) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Team member not found.' }, { status: 404 }),
    };
  }

  if (actor.kind === 'STAFF' && member.staffId === actor.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You cannot change your own access. Ask the organizer's owner." },
        { status: 403 },
      ),
    };
  }

  if (!canManageMember(actor, asMembershipRole(member.role) ?? 'STAFF')) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only the organizer's owner can change an Admin's access." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, actor, member };
}

export type ManagedMember = {
  id: string;
  role: string;
  staffId: string;
  acceptedAt: Date | null;
  suspendedAt: Date | null;
  staff: { name: string; email: string; password: string | null };
  assignments: { eventId: string; role: string; event: { title: string } }[];
};

/** The membership's access as it stands, in the shape `readAccess` produces. */
export function currentAccess(member: ManagedMember): MemberAccess {
  const role = asMembershipRole(member.role) ?? 'STAFF';
  return {
    role,
    assignments:
      role === 'ADMIN'
        ? []
        : member.assignments.flatMap(assignment => {
            const eventRole = asEventRole(assignment.role);
            return eventRole ? [{ eventId: assignment.eventId, role: eventRole }] : [];
          }),
  };
}
