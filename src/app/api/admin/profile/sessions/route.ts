import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { getActor, reissuedSessionClaims, sessionsCutoff } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';

/**
 * "Sign out other devices" on /admin/settings (SETTINGS_PLAN.md Batch 3).
 *
 * Moves the person's own `sessionsValidFrom` — the StaffAccount's for staff
 * and client viewers, Run As One's Organizer row for the owner — to now, which
 * `getActor()` reads on every request, so every other session is dead on its
 * next click rather than when its JWT expires. This session is then reissued,
 * so the person who pressed the button stays signed in.
 *
 * Self-service like the rest of `admin/profile`: the id comes from the
 * session, so anyone who can sign in may end their own sessions and nobody
 * else's. No password is asked — ending sessions only takes access away, and
 * the person most likely to need it is one who fears somebody else is in.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessionsValidFrom = sessionsCutoff();
    const isStaff = actor.kind === 'STAFF';

    await prisma.$transaction(async tx => {
      if (isStaff) {
        await tx.staffAccount.update({ where: { id: actor.id }, data: { sessionsValidFrom } });
      } else {
        await tx.organizer.update({ where: { id: actor.id }, data: { sessionsValidFrom } });
      }
      await recordAudit(tx, actor, {
        action: 'profile.sessions.ended',
        entityType: isStaff ? 'StaffAccount' : 'Organizer',
        entityId: actor.id,
        summary: 'Signed out on every other device.',
      });
    });

    await setAuthCookie(await createToken(reissuedSessionClaims(actor)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to sign out other devices:', error);
    return NextResponse.json(
      { error: 'Could not sign out your other devices. Please try again.' },
      { status: 500 },
    );
  }
}
