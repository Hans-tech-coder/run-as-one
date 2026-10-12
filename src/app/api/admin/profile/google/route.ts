import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';

/**
 * Unlinking Google sign-in from the signed-in person's own account (Settings ›
 * Security, LOGIN_UX_PLAN.md D7). Staff and client viewers only — the owner
 * never links Google (D5).
 *
 * **It asks for the current password**, for the reason the password route
 * does — a borrowed unlocked laptop cannot change how the account signs in —
 * and because an account is never left without a way in: a person who can
 * unlink has just proved the password still works. Unlinking does not end any
 * session. The next "Continue with Google" with the account's email links
 * again, so this is also how a person moves to a different Google account.
 */
export async function PATCH(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (actor.kind !== 'STAFF') {
      return NextResponse.json({ error: 'This account does not use Google sign-in.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return NextResponse.json({ errors: { password: 'Enter your current password' } }, { status: 400 });
    }

    const account = await prisma.staffAccount.findUnique({
      where: { id: actor.id },
      select: { password: true, googleSub: true },
    });
    if (!account?.password) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyPassword(password, account.password))) {
      return NextResponse.json(
        { errors: { password: 'That is not your current password' } },
        { status: 400 }
      );
    }

    if (account.googleSub) {
      await prisma.$transaction(async tx => {
        await tx.staffAccount.update({ where: { id: actor.id }, data: { googleSub: null } });
        await recordAudit(tx, actor, {
          action: 'auth.google_unlinked',
          entityType: 'StaffAccount',
          entityId: actor.id,
          summary: 'Unlinked Google sign-in.',
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to unlink Google sign-in:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
