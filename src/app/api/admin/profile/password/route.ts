import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie, hashPassword, verifyPassword } from '@/lib/auth';

/** What the form enforces too, quoted in the helper text under the field. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The signed-in organizer changing their own password.
 *
 * Split from the profile route rather than folded into it because the two ask
 * for different things: a name change is a correction, a password change has to
 * prove the person at the keyboard is the account holder. Requiring the current
 * password is that proof — a borrowed unlocked laptop cannot lock the real
 * organizer out of their own events.
 */
export async function PATCH(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
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

    const organizer = await prisma.organizer.findUnique({ where: { id: auth.id } });
    if (!organizer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyPassword(currentPassword, organizer.password))) {
      return NextResponse.json(
        { errors: { currentPassword: 'That is not your current password' } },
        { status: 400 }
      );
    }

    await prisma.organizer.update({
      where: { id: organizer.id },
      data: { password: await hashPassword(newPassword) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to change organizer password:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
