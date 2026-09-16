import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createToken, hashPassword, setAuthCookie, verifyPassword } from '@/lib/auth';
import { staffSessionClaims } from '@/lib/actor';
import { organizerCanSignIn } from '@/lib/organizer-status';
import { recordAudit, type AuditActor } from '@/lib/audit';
import { MAX_NAME_LENGTH, newPasswordErrors, type FieldErrors } from '@/lib/team';
import { findOpenInvitation, hashInviteToken } from '@/lib/team-invite';

/**
 * Accepting an invitation to an organizer's team — public, because the person
 * arriving has no session. The token in the URL is what proves they received
 * the email.
 *
 * Two shapes, decided by the account rather than by the body:
 *
 * - **A new person** chooses their own password here, and may correct the name
 *   they were invited under — the trail will carry it on everything they do,
 *   so it should be the one they go by.
 * - **Someone who already has an account** (they work another organizer's
 *   races) proves the password they already use. The link alone is not
 *   enough: it proves somebody can read that inbox, and a forwarded email
 *   should not be a way into another person's login.
 *
 * Either way they are signed straight in to the organizer that invited them.
 * The membership is **claimed** with a conditional update before anything
 * else is written, so a link pressed twice cannot accept twice.
 */

const GONE =
  'This invitation link has expired or has already been used. Ask the person who invited you to send a new one.';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invitation = await findOpenInvitation(token);

    if (!invitation) {
      return NextResponse.json({ error: GONE }, { status: 410 });
    }
    if (!organizerCanSignIn(invitation.organizer.status)) {
      return NextResponse.json(
        {
          error: `${invitation.organizer.name} is not active right now, so its invitations cannot be accepted. Please contact them.`,
        },
        { status: 403 },
      );
    }
    if (invitation.staff.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: 'This account has been suspended. Please contact support.' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const existingPassword = invitation.staff.password;

    const who: AuditActor = {
      kind: 'STAFF',
      id: invitation.staff.id,
      orgId: invitation.organizerId,
      name: invitation.staff.name,
      email: invitation.staff.email,
    };

    let name = invitation.staff.name;
    let newPasswordHash: string | null = null;

    if (existingPassword) {
      const password = typeof body.password === 'string' ? body.password : '';
      if (!password) {
        return NextResponse.json(
          { errors: { password: 'Enter the password you already sign in with' } },
          { status: 400 },
        );
      }
      if (!(await verifyPassword(password, existingPassword))) {
        // Written down like any wrong password: a forwarded invitation being
        // tried against someone's login is what an owner would want to see.
        await recordAudit(prisma, who, {
          action: 'auth.sign_in_failed',
          entityType: 'StaffAccount',
          entityId: invitation.staff.id,
          summary: 'Failed to accept an invitation: wrong password.',
          changes: { reason: 'WRONG_PASSWORD' },
        });
        return NextResponse.json(
          { errors: { password: 'That is not the password for this account' } },
          { status: 401 },
        );
      }
    } else {
      const errors: FieldErrors = newPasswordErrors(body.password, body.confirmPassword);
      const typedName = typeof body.name === 'string' ? body.name.trim() : '';
      if (!typedName) {
        errors.name = 'Enter your name as your team should see it';
      } else if (typedName.length > MAX_NAME_LENGTH) {
        errors.name = `Keep your name to ${MAX_NAME_LENGTH} characters or fewer`;
      }
      if (Object.keys(errors).length > 0) {
        return NextResponse.json({ errors }, { status: 400 });
      }
      name = typedName;
      newPasswordHash = await hashPassword(body.password);
    }

    const now = new Date();

    const accepted = await prisma.$transaction(async tx => {
      const claim = await tx.staffMembership.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          inviteTokenHash: hashInviteToken(token),
          inviteExpiresAt: { gt: now },
        },
        data: { acceptedAt: now, inviteTokenHash: null, inviteExpiresAt: null },
      });
      if (claim.count === 0) return false;

      await tx.staffAccount.update({
        where: { id: invitation.staff.id },
        data: {
          ...(newPasswordHash ? { password: newPasswordHash, name } : {}),
          status: 'ACTIVE',
          lastLoginAt: now,
        },
      });

      const person: AuditActor = { ...who, name };
      await recordAudit(tx, person, [
        {
          action: 'staff.invitation.accepted',
          entityType: 'StaffMembership',
          entityId: invitation.id,
          summary: `${name} accepted the invitation and joined the team.`,
          ...(name !== invitation.staff.name
            ? { changes: { name: [invitation.staff.name, name] } }
            : {}),
        },
        {
          action: 'auth.signed_in',
          entityType: 'StaffAccount',
          entityId: invitation.staff.id,
          summary: 'Signed in.',
        },
      ]);
      return true;
    });

    if (!accepted) {
      return NextResponse.json({ error: GONE }, { status: 410 });
    }

    const sessionToken = await createToken(
      staffSessionClaims(
        { id: invitation.staff.id, email: invitation.staff.email, name },
        { organizerId: invitation.organizerId, role: invitation.role },
      ),
    );
    await setAuthCookie(sessionToken);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Invitation accept error:', error);
    return NextResponse.json(
      { error: 'Something went wrong while accepting the invitation.' },
      { status: 500 },
    );
  }
}
