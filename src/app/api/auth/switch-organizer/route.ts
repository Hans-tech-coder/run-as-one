import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { activeMembershipWhere, getActor, staffSessionClaims } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';

/**
 * A staff member moving their session from one organizer to another they also
 * work for — the sidebar's organizer switcher.
 *
 * One email serves a freelancer across several organizers (STAFF_ACCESS_PLAN
 * §1.2), but a session acts inside exactly one: `orgId` is what every admin
 * route scopes by. So switching reissues the session with a different `orgId`,
 * checked against `activeMembershipWhere` — the same rule sign-in uses — so a
 * suspended or removed membership cannot be switched into.
 *
 * The trail entry goes into the organizer being entered and does not name the
 * one being left: which other organizers a person works for is not this
 * organizer's business.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (actor.kind !== 'STAFF') {
      return NextResponse.json(
        { error: 'Only a team member who works for several organizers can switch between them.' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const organizerId = typeof body.organizerId === 'string' ? body.organizerId : '';

    const membership = organizerId
      ? await prisma.staffMembership.findFirst({
          where: { ...activeMembershipWhere(actor.id), organizerId },
          select: { organizerId: true, role: true },
        })
      : null;

    if (!membership) {
      return NextResponse.json({ error: 'That organizer could not be found.' }, { status: 404 });
    }
    if (membership.organizerId === actor.orgId) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    await recordAudit(prisma, { ...actor, orgId: membership.organizerId }, {
      action: 'auth.organizer.switched',
      entityType: 'StaffAccount',
      entityId: actor.id,
      summary: 'Signed in by switching over from another organizer.',
    });

    const token = await createToken(
      staffSessionClaims({ id: actor.id, email: actor.email, name: actor.name }, membership),
    );
    await setAuthCookie(token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Organizer switch error:', error);
    return NextResponse.json({ error: 'Something went wrong while switching organizers.' }, { status: 500 });
  }
}
