import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { inviteOrigin, newInvitation, sendInvitation } from '@/lib/team-invite';
import { loadManagedMember } from '../member';

/**
 * Sending an invitation again — because it expired, went to spam, or never
 * left (Resend's free tier stops rather than bills).
 *
 * A resend issues a **new** token and a new week, and the old link dies with
 * the hash it matched. Re-sending the same token would need it kept somewhere
 * readable, and the whole point of storing a hash is that it is not.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadManagedMember(id);
    if (!loaded.ok) return loaded.response;
    const { actor, member } = loaded;

    if (member.acceptedAt) {
      return NextResponse.json(
        { error: 'This person has already accepted, so there is no invitation to resend.' },
        { status: 400 },
      );
    }

    const invitation = newInvitation();

    await prisma.$transaction(async tx => {
      await tx.staffMembership.update({
        where: { id: member.id },
        data: { inviteTokenHash: invitation.tokenHash, inviteExpiresAt: invitation.expiresAt },
      });
      await recordAudit(tx, actor, {
        action: 'staff.invitation.resent',
        entityType: 'StaffMembership',
        entityId: member.id,
        summary: `Resent the invitation to ${member.staff.name} (${member.staff.email}).`,
      });
    });

    const outcome = await sendInvitation({
      membershipId: member.id,
      token: invitation.token,
      origin: inviteOrigin(request),
      inviterName: actor.name,
    });

    return NextResponse.json({
      success: true,
      expiresAt: invitation.expiresAt.toISOString(),
      emailSent: outcome.sent,
      emailError: outcome.sent ? null : outcome.error,
    });
  } catch (error) {
    console.error('Team invite resend error:', error);
    return NextResponse.json({ error: 'Something went wrong while resending the invitation.' }, { status: 500 });
  }
}
