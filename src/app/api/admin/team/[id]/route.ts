import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { canManageMember } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { describeAccess, readAccess, type MemberAccess } from '@/lib/team';
import { currentAccess, loadManagedMember } from './member';

/**
 * One member of the organizer's team: change what they may reach, suspend or
 * reinstate them, or take them off the team.
 *
 * Who may touch whom is decided once, in `loadManagedMember` (./member.ts).
 *
 * **A change takes effect on the person's next click**, not at their next
 * sign-in: `getActor()` reads the membership's role, assignments and
 * suspension from the database on every request, so nothing here has to end a
 * session to make itself felt.
 *
 * **The trail outlives the membership.** Removing someone deletes their
 * membership and its assignments; every audit row that names them stays,
 * carrying the name and address it was written with (§4.2).
 */

/** Access as one comparable string, so an edit that changes nothing writes nothing. */
function accessKey(access: MemberAccess): string {
  return JSON.stringify([
    access.role,
    [...access.assignments].sort((a, b) => a.eventId.localeCompare(b.eventId)),
  ]);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadManagedMember(id);
    if (!loaded.ok) return loaded.response;
    const { actor, member } = loaded;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'The change could not be read.' }, { status: 400 });
    }

    const name = member.staff.name;

    // ── Suspend or reinstate, on its own ───────────────────────────────────
    // The row menu has no form open, so it posts only the switch — the same
    // shape as a promotion's pause.
    if (typeof body.suspended === 'boolean' && body.role === undefined) {
      if (!member.acceptedAt) {
        return NextResponse.json(
          {
            error:
              'An invitation that has not been accepted cannot be suspended. Revoke the invitation instead.',
          },
          { status: 400 },
        );
      }

      const suspend = body.suspended;
      if (suspend === Boolean(member.suspendedAt)) {
        return NextResponse.json({ success: true, unchanged: true });
      }

      await prisma.$transaction(async tx => {
        await tx.staffMembership.update({
          where: { id: member.id },
          data: suspend
            ? { suspendedAt: new Date(), suspendedById: actor.id }
            : { suspendedAt: null, suspendedById: null },
        });
        await recordAudit(tx, actor, {
          action: suspend ? 'staff.suspended' : 'staff.reinstated',
          entityType: 'StaffMembership',
          entityId: member.id,
          summary: suspend
            ? `Suspended ${name} (${member.staff.email}). They can no longer sign in to this organizer.`
            : `Reinstated ${name} (${member.staff.email}).`,
        });
      });

      return NextResponse.json({ success: true });
    }

    // ── A change of role or events ─────────────────────────────────────────
    if (body.role === undefined) {
      return NextResponse.json({ error: 'Nothing to change was sent.' }, { status: 400 });
    }

    const events = await prisma.event.findMany({
      where: { organizerId: actor.orgId },
      select: { id: true, title: true },
    });
    const titles = new Map(events.map(event => [event.id, event.title]));

    const { access, errors } = readAccess(body.role, body.assignments, new Set(titles.keys()));
    if (access && !canManageMember(actor, access.role)) {
      errors.role = 'Only the Super Admin can make someone an Admin';
    }
    if (!access || Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const before = currentAccess(member);
    if (accessKey(before) === accessKey(access)) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    // A title the organizer can no longer see (the event was deleted since)
    // still has to read as something in the sentence.
    const beforeTitles = new Map(member.assignments.map(a => [a.eventId, a.event.title]));
    const titleOf = (eventId: string) =>
      titles.get(eventId) ?? beforeTitles.get(eventId) ?? 'an event';

    const keep = access.assignments.map(assignment => assignment.eventId);

    await prisma.$transaction(async tx => {
      await tx.staffMembership.update({
        where: { id: member.id },
        data: { role: access.role },
      });

      // Replaced in place rather than wiped and rewritten, so an assignment
      // that did not change keeps the moment it was first given.
      await tx.eventAssignment.deleteMany({
        where: { membershipId: member.id, eventId: { notIn: keep } },
      });
      for (const assignment of access.assignments) {
        await tx.eventAssignment.upsert({
          where: {
            membershipId_eventId: { membershipId: member.id, eventId: assignment.eventId },
          },
          update: { role: assignment.role },
          create: {
            membershipId: member.id,
            eventId: assignment.eventId,
            role: assignment.role,
            assignedById: actor.id,
          },
        });
      }

      await recordAudit(tx, actor, {
        action: 'staff.access.changed',
        entityType: 'StaffMembership',
        entityId: member.id,
        summary: `Changed ${name}'s access from ${describeAccess(before, titleOf)} to ${describeAccess(
          access,
          titleOf,
        )}.`,
        changes: {
          ...(before.role !== access.role ? { role: [before.role, access.role] } : {}),
          events: [before.assignments.length, access.assignments.length],
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Team member update error:', error);
    return NextResponse.json({ error: 'Something went wrong while saving that change.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadManagedMember(id);
    if (!loaded.ok) return loaded.response;
    const { actor, member } = loaded;

    await prisma.$transaction(async tx => {
      await tx.staffMembership.delete({ where: { id: member.id } });

      // An account that never set a password and now belongs to no organizer
      // was only ever an invitation; keeping it would hold the address against
      // the next organizer who invites that person. An account with a password
      // is somebody's login — possibly for other organizers — and stays.
      if (!member.staff.password) {
        const remaining = await tx.staffMembership.count({ where: { staffId: member.staffId } });
        if (remaining === 0) {
          await tx.staffAccount.delete({ where: { id: member.staffId } });
        }
      }

      await recordAudit(tx, actor, {
        action: 'staff.removed',
        entityType: 'StaffMembership',
        entityId: member.id,
        summary: member.acceptedAt
          ? `Removed ${member.staff.name} (${member.staff.email}) from the team.`
          : `Revoked the invitation to ${member.staff.name} (${member.staff.email}).`,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Team member removal error:', error);
    return NextResponse.json({ error: 'Something went wrong while removing that team member.' }, { status: 500 });
  }
}
