import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createToken, hashPassword, setAuthCookie, verifyPassword } from '@/lib/auth';
import { getActor, staffSessionClaims } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';

/** What the form enforces too, quoted in the helper text under the field. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The signed-in person changing their own password.
 *
 * Split from the profile route rather than folded into it because the two ask
 * for different things: a name change is a correction, a password change has to
 * prove the person at the keyboard is the account holder. Requiring the current
 * password is that proof — a borrowed unlocked laptop cannot lock the real
 * organizer out of their own events.
 *
 * For a **staff member** a password change also ends every other session
 * (`StaffAccount.sessionsValidFrom`), since the usual reason to change one is
 * that somebody else may know it; this session is reissued so the person who
 * just proved themselves is not signed out with the rest. The trail records
 * that the password changed and nothing about it.
 */
export async function PATCH(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const currentPassword =
      typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    const errors: Record<string, string> = {};

    if (!currentPassword) {
      errors.currentPassword = 'Enter your current password';
    }

    if (!newPassword) {
      errors.newPassword = 'Enter the new password you want to use';
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      errors.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    } else if (newPassword === currentPassword) {
      errors.newPassword = 'The new password is the same as your current one';
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const isStaff = actor.kind === 'STAFF';

    const account = isStaff
      ? await prisma.staffAccount.findUnique({ where: { id: actor.id } })
      : await prisma.organizer.findUnique({ where: { id: actor.id } });
    if (!account?.password) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyPassword(currentPassword, account.password))) {
      return NextResponse.json(
        { errors: { currentPassword: 'That is not your current password' } },
        { status: 400 }
      );
    }

    const password = await hashPassword(newPassword);
    // Whole seconds, because a JWT's `iat` is whole seconds: a boundary with a
    // fractional part would make the token reissued below older than it.
    const sessionsValidFrom = new Date(Math.floor(Date.now() / 1000) * 1000);

    await prisma.$transaction(async tx => {
      if (isStaff) {
        await tx.staffAccount.update({
          where: { id: actor.id },
          data: { password, sessionsValidFrom },
        });
      } else {
        await tx.organizer.update({
          where: { id: actor.id },
          data: { password },
        });
      }
      await recordAudit(tx, actor, {
        action: 'profile.password.changed',
        entityType: isStaff ? 'StaffAccount' : 'Organizer',
        entityId: actor.id,
        summary: 'Changed their password.',
      });
    });

    if (isStaff) {
      const token = await createToken(
        staffSessionClaims(
          { id: actor.id, name: actor.name, email: actor.email },
          { organizerId: actor.orgId, role: actor.role },
        ),
      );
      await setAuthCookie(token);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to change organizer password:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
