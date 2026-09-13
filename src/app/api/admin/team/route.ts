import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { can, canManageMember, findAccountByEmail, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { describeAccess, readAccess, readInvitee, type FieldErrors } from '@/lib/team';
import { inviteOrigin, newInvitation, sendInvitation } from '@/lib/team-invite';

/**
 * Inviting a person onto the organizer's team (STAFF_ACCESS_PLAN.md, Batch 2).
 *
 * The owner or an admin names the person, the address, the role and — for
 * STAFF — the events and the role on each. What they never do is set a
 * password: the invitee chooses their own from the link (§1.5), because the
 * moment two people know one password the trail records a session rather than
 * a person.
 *
 * **One email, several organizers.** An address that already belongs to a
 * StaffAccount — a freelance timer who works another organizer's races — gets
 * a second membership on the same account rather than a second account, and
 * keeps the name they gave themselves. An address that signs in as an
 * Organizer is refused: one address, one login (findAccountByEmail).
 *
 * The rows, their assignments and the trail entry are one transaction; the
 * email goes after, and never fails the invite. A failed send is reported so
 * the person inviting can resend from the row rather than wait on an email
 * that never left.
 *
 * Refusals name the field they are about (`errors`), so the form puts each
 * message under the control that caused it.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(actor, 'team:manage', { organizerId: actor.orgId })) {
      return NextResponse.json({ error: 'You do not have access to manage this team.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'The invitation could not be read.' }, { status: 400 });
    }

    // Every event this organizer runs, finished ones included: a validator may
    // well be added to settle the last orders of a race already run.
    const events = await prisma.event.findMany({
      where: { organizerId: actor.orgId },
      select: { id: true, title: true },
    });
    const titles = new Map(events.map(event => [event.id, event.title]));

    const invitee = readInvitee(body.name, body.email);
    const { access, errors: accessErrors } = readAccess(
      body.role,
      body.assignments,
      new Set(titles.keys()),
    );
    const errors: FieldErrors = { ...invitee.errors, ...accessErrors };

    if (access && !canManageMember(actor, access.role)) {
      errors.role = "Only the organizer's owner can make someone an Admin";
    }
    if (!access || Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const account = await findAccountByEmail(invitee.email);

    if (account?.kind === 'ORGANIZER') {
      return NextResponse.json(
        {
          errors: {
            email:
              'That address already signs in as an organizer account, so it cannot also join a team. Ask them for another address.',
          },
        },
        { status: 409 },
      );
    }

    const existingStaff = account?.kind === 'STAFF' ? account.staff : null;

    if (existingStaff) {
      const existing = await prisma.staffMembership.findUnique({
        where: {
          staffId_organizerId: { staffId: existingStaff.id, organizerId: actor.orgId },
        },
        select: { acceptedAt: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            errors: {
              email: existing.acceptedAt
                ? 'This person is already on your team.'
                : 'This person already has an invitation waiting. Resend it from their row instead.',
            },
          },
          { status: 409 },
        );
      }
      if (existingStaff.status === 'SUSPENDED') {
        return NextResponse.json(
          {
            errors: {
              email: 'This account has been suspended on the platform and cannot be invited. Please contact support.',
            },
          },
          { status: 409 },
        );
      }
    }

    const invitation = newInvitation();

    const created = await prisma.$transaction(async tx => {
      const person =
        existingStaff ??
        (await tx.staffAccount.create({
          data: { email: invitee.email, name: invitee.name, status: 'INVITED' },
        }));

      const membership = await tx.staffMembership.create({
        data: {
          staffId: person.id,
          organizerId: actor.orgId,
          role: access.role,
          invitedById: actor.id,
          inviteTokenHash: invitation.tokenHash,
          inviteExpiresAt: invitation.expiresAt,
          assignments: {
            create: access.assignments.map(assignment => ({
              eventId: assignment.eventId,
              role: assignment.role,
              assignedById: actor.id,
            })),
          },
        },
        select: { id: true },
      });

      await recordAudit(tx, actor, {
        action: 'staff.invited',
        entityType: 'StaffMembership',
        entityId: membership.id,
        summary: `Invited ${person.name} (${person.email}) as ${describeAccess(
          access,
          eventId => titles.get(eventId) ?? 'an event',
        )}.`,
        changes: { role: access.role, events: access.assignments.length },
      });

      return { id: membership.id, name: person.name };
    });

    const outcome = await sendInvitation({
      membershipId: created.id,
      token: invitation.token,
      origin: inviteOrigin(request),
      inviterName: actor.name,
    });

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        emailSent: outcome.sent,
        emailError: outcome.sent ? null : outcome.error,
      },
      { status: 201 },
    );
  } catch (error) {
    // Two invitations for one new address landing together: the second loses
    // the unique index, and is told what the first one did.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        {
          errors: {
            email: 'This person already has an invitation waiting. Resend it from their row instead.',
          },
        },
        { status: 409 },
      );
    }
    console.error('Team invite error:', error);
    return NextResponse.json({ error: 'Something went wrong while sending the invitation.' }, { status: 500 });
  }
}
