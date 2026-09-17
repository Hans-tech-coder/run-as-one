import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { findAccountByEmail } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { canMoveClient, clientStatusAfter } from '@/lib/client';
import { readInvitee } from '@/lib/team';
import { inviteOrigin, newInvitation, sendInvitation } from '@/lib/team-invite';
import { platformActor } from '../../../platform-actor';

/**
 * **Send invite** — letting a client submission in (ADMIN_MERGE_PLAN.md,
 * Batch 3).
 *
 * Nothing is approved and nothing is sent when somebody applies. When Run As
 * One is ready to run a race for them, a staff member presses Send invite
 * here, naming the person who should sign in (the screen opens on the contact
 * the application gave). What that creates is a **client viewer**: a
 * `StaffAccount` with a `VIEWER` membership on Run As One's own tenant, the
 * membership carrying `clientId` — through exactly the team machinery, so the
 * token is hashed, the link lives a week, the accept page is
 * `/admin/invite/[token]`, and nobody ever sets a password for anyone.
 *
 * The same press is the **resend**: an invitation to a person who already has
 * one waiting on this client issues a new token and kills the old link. The
 * client moves to INVITED (an ACTIVE client stays ACTIVE, so a second contact
 * never signs out the first), and `invitedAt` says when.
 *
 * Refused, each under the field it is about:
 * - an address that signs in as an Organizer — one address, one login;
 * - an address already on Run As One's team, or already a sign-in for another
 *   client — a membership is unique per person per tenant, and one person
 *   cannot be both;
 * - an address that already signs in for this client, while it is ACTIVE.
 *
 * One case is not a refusal: a client restored from the archive sits at NEW
 * even though its old sign-in was never removed. Inviting that same person
 * again makes the client ACTIVE and emails nobody, because they already have
 * their password and the link would only be refused.
 *
 * The rows and the trail entry are one transaction, conditional on the status
 * the client had when it was read; the email goes after and never fails the
 * invite. The answer carries `emailSent` / `emailError` like the team invite.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { actor, refusal } = await platformActor();
    if (refusal) return refusal;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'The invitation could not be read.' }, { status: 400 });
    }

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }
    if (!canMoveClient(client.status, 'invite')) {
      return NextResponse.json(
        { error: `${client.name} is archived. Restore it before sending an invite.` },
        { status: 409 },
      );
    }

    const invitee = readInvitee(body.name, body.email);
    if (Object.keys(invitee.errors).length > 0) {
      return NextResponse.json({ errors: invitee.errors }, { status: 400 });
    }

    const account = await findAccountByEmail(invitee.email);

    if (account?.kind === 'ORGANIZER') {
      return NextResponse.json(
        {
          errors: {
            email:
              'That address already signs in as an organizer account, so it cannot also be a client sign-in. Use another address for this person.',
          },
        },
        { status: 409 },
      );
    }

    const existingStaff = account?.kind === 'STAFF' ? account.staff : null;
    const existingMembership = existingStaff
      ? await prisma.staffMembership.findUnique({
          where: { staffId_organizerId: { staffId: existingStaff.id, organizerId: actor.orgId } },
          select: { id: true, role: true, clientId: true, acceptedAt: true },
        })
      : null;

    if (existingMembership) {
      const sameClient =
        existingMembership.role === 'VIEWER' && existingMembership.clientId === client.id;
      if (!sameClient) {
        return NextResponse.json(
          {
            errors: {
              email:
                existingMembership.role === 'VIEWER'
                  ? 'That address already signs in for another client. Use another address for this person.'
                  : 'That address belongs to someone on the Run As One team. Use another address for this person.',
            },
          },
          { status: 409 },
        );
      }
      if (existingMembership.acceptedAt && client.status === 'ACTIVE') {
        return NextResponse.json(
          { errors: { email: `This person already signs in for ${client.name}.` } },
          { status: 409 },
        );
      }
    } else if (existingStaff?.status === 'SUSPENDED') {
      return NextResponse.json(
        {
          errors: {
            email: 'This account has been suspended on the platform and cannot be invited.',
          },
        },
        { status: 409 },
      );
    }

    const now = new Date();

    // A restored client whose old sign-in is still there: active again, no email.
    if (existingMembership?.acceptedAt && existingStaff) {
      const reactivated = await prisma.$transaction(async tx => {
        const claim = await tx.client.updateMany({
          where: { id: client.id, status: client.status },
          data: { status: 'ACTIVE', invitedAt: now },
        });
        if (claim.count === 0) return false;
        await recordAudit(tx, actor, {
          action: 'client.invited',
          entityType: 'Client',
          entityId: client.id,
          summary: `${existingStaff.name} (${existingStaff.email}) already had a sign-in for ${client.name}, so the client is active again.`,
          changes: { status: [client.status, 'ACTIVE'] },
        });
        return true;
      });
      if (!reactivated) return changedUnderneath(client.name);
      return NextResponse.json({
        name: existingStaff.name,
        reactivated: true,
        emailSent: null,
        emailError: null,
      });
    }

    const next = clientStatusAfter(client.status, 'invite');
    if (!next) return changedUnderneath(client.name);

    const invitation = newInvitation(now);
    const resend = Boolean(existingMembership);

    const created = await prisma.$transaction(async tx => {
      const claim = await tx.client.updateMany({
        where: { id: client.id, status: client.status },
        data: { status: next, invitedAt: now },
      });
      if (claim.count === 0) return null;

      const person =
        existingStaff ??
        (await tx.staffAccount.create({
          data: { email: invitee.email, name: invitee.name, status: 'INVITED' },
        }));

      const membership = existingMembership
        ? await tx.staffMembership.update({
            where: { id: existingMembership.id },
            data: {
              inviteTokenHash: invitation.tokenHash,
              inviteExpiresAt: invitation.expiresAt,
              invitedById: actor.id,
              invitedAt: now,
            },
            select: { id: true },
          })
        : await tx.staffMembership.create({
            data: {
              staffId: person.id,
              organizerId: actor.orgId,
              role: 'VIEWER',
              clientId: client.id,
              invitedById: actor.id,
              invitedAt: now,
              inviteTokenHash: invitation.tokenHash,
              inviteExpiresAt: invitation.expiresAt,
            },
            select: { id: true },
          });

      await recordAudit(tx, actor, {
        action: resend ? 'client.invitation.resent' : 'client.invited',
        entityType: 'Client',
        entityId: client.id,
        summary: resend
          ? `Resent the invitation for ${client.name} to ${person.name} (${person.email}).`
          : `Invited ${person.name} (${person.email}) to sign in for ${client.name}.`,
        ...(client.status !== next ? { changes: { status: [client.status, next] } } : {}),
      });

      return { membershipId: membership.id, name: person.name };
    });

    if (!created) return changedUnderneath(client.name);

    const outcome = await sendInvitation({
      membershipId: created.membershipId,
      token: invitation.token,
      origin: inviteOrigin(request),
      inviterName: actor.name,
    });

    return NextResponse.json(
      {
        name: created.name,
        resent: resend,
        expiresAt: invitation.expiresAt.toISOString(),
        emailSent: outcome.sent,
        emailError: outcome.sent ? null : outcome.error,
      },
      { status: resend ? 200 : 201 },
    );
  } catch (error) {
    // Two invites for one new address landing together: the second loses the
    // unique index on the account or the membership.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { errors: { email: 'An invitation to this address was just sent. Refresh the list to see it.' } },
        { status: 409 },
      );
    }
    console.error('Client invite error:', error);
    return NextResponse.json({ error: 'Something went wrong while sending the invitation.' }, { status: 500 });
  }
}

function changedUnderneath(name: string) {
  return NextResponse.json(
    { error: `${name} changed while you were looking at it. Refresh the list and try again.` },
    { status: 409 },
  );
}
