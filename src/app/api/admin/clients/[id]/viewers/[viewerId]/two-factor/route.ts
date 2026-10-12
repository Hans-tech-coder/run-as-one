import { after, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { sendTwoStepResetEmail } from '@/lib/email-password';
import { resetTwoFactor } from '@/lib/two-factor';
import { platformActor } from '../../../../../platform-actor';

/**
 * Resetting a client viewer's two-step sign-in, from the client's Sign-ins
 * (TWO_FACTOR_PLAN.md D4, task 4.2).
 *
 * The same people as on the Team page — owner and admins, asked here as
 * `platform:manage` because that is the door to the Clients screen — and the
 * same rules: a VIEWER membership of **this** client in this organizer (an id
 * from the browser is no proof, and a miss reads the same whoever's it is),
 * never the actor's own account, every session ended, and an email (D10).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; viewerId: string }> },
) {
  try {
    const { actor, refusal } = await platformActor();
    if (refusal) return refusal;

    const { id, viewerId } = await params;
    const viewer = await prisma.staffMembership.findFirst({
      where: { id: viewerId, clientId: id, organizerId: actor.orgId, role: 'VIEWER' },
      select: { staffId: true, staff: { select: { name: true, email: true } } },
    });
    if (!viewer) {
      return NextResponse.json({ error: 'That sign-in was not found.' }, { status: 404 });
    }
    if (actor.kind === 'STAFF' && viewer.staffId === actor.id) {
      return NextResponse.json(
        { error: 'You cannot reset your own two-step sign-in here. Turn it off in Settings › Security.' },
        { status: 403 },
      );
    }

    const staff = { id: viewer.staffId, name: viewer.staff.name, email: viewer.staff.email };
    const resetAt = new Date();
    if (!(await resetTwoFactor(actor, staff))) {
      return NextResponse.json(
        { error: `${staff.name} does not have two-step sign-in on, so there is nothing to reset.` },
        { status: 409 },
      );
    }

    after(async () => {
      const outcome = await sendTwoStepResetEmail({ to: staff.email, name: staff.name, resetBy: actor.name, resetAt });
      if (!outcome.sent) console.error('Two-step reset email not sent:', outcome.error);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Client viewer two-step reset error:', error);
    return NextResponse.json(
      { error: 'Something went wrong while resetting two-step sign-in.' },
      { status: 500 },
    );
  }
}
