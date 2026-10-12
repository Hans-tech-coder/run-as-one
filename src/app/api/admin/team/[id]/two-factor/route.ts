import { after, NextResponse } from 'next/server';
import { sendTwoStepResetEmail } from '@/lib/email-password';
import { resetTwoFactor } from '@/lib/two-factor';
import { loadManagedMember } from '../member';

/**
 * Resetting a team member's two-step sign-in, for a lost phone with no
 * recovery codes left (TWO_FACTOR_PLAN.md D4).
 *
 * Who may is `loadManagedMember`'s answer, the same as for a suspension: a
 * holder of `team:manage`, never on their own row (their own is turned off in
 * Settings › Security, with their password and a code), and an admin never on
 * another admin. The owner has no membership, so nobody reaches the owner's
 * from here.
 *
 * The reset ends every session the member has (lib/two-factor.ts) and emails
 * them (D10).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadManagedMember(id);
    if (!loaded.ok) return loaded.response;
    const { actor, member } = loaded;

    const staff = { id: member.staffId, name: member.staff.name, email: member.staff.email };
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
    console.error('Team member two-step reset error:', error);
    return NextResponse.json(
      { error: 'Something went wrong while resetting two-step sign-in.' },
      { status: 500 },
    );
  }
}
