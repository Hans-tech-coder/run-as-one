import { NextResponse, after } from 'next/server';
import { hashPassword } from '@/lib/auth';
import {
  findReset,
  resetPassword,
  resetTargetOf,
  sendPasswordChangedNotice,
} from '@/lib/password-reset';
import { LOGIN_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { newPasswordErrors } from '@/lib/team';

/**
 * Choosing a new password through a reset link — public, from
 * `/admin/reset-password/[token]`. The token in the URL is what proves the
 * person received the email; the rules are lib/password-reset.ts's.
 *
 * It does **not** sign the person in (LOGIN_UX_PLAN.md D3): every session ends
 * and the page sends them to `/admin/login?reset=1`. The "password changed"
 * email goes out in `after()`.
 *
 * Throttled per address with the sign-in rule (`LOGIN_RULE`, its own bucket):
 * the token is 256 random bits, so this is against hammering, not guessing.
 */

const GONE = {
  used: 'This link has already been used. Request a new one if you still need to reset your password.',
  expired: 'This link has expired. Request a new one to reset your password.',
} as const;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!allowRequest('reset-password', callerKey(request), LOGIN_RULE)) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute, then try again.' },
      { status: 429 },
    );
  }

  try {
    const { token } = await params;
    const found = await findReset(token);
    if (found.state !== 'open') {
      return NextResponse.json({ error: GONE[found.state], state: found.state }, { status: 410 });
    }

    const body = await request.json().catch(() => ({}));
    const errors = newPasswordErrors(body?.password, body?.confirmPassword);
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Asked again: a suspension, or an archived client, in the hour since the
    // link was sent still stops it.
    const target = await resetTargetOf(found.reset);
    if (!target) {
      return NextResponse.json(
        { error: 'This sign-in cannot be reset right now. Please contact Run As One.' },
        { status: 403 },
      );
    }

    const passwordHash = await hashPassword(body.password);
    if (!(await resetPassword({ reset: found.reset, target, passwordHash }))) {
      return NextResponse.json({ error: GONE.used, state: 'used' }, { status: 410 });
    }

    after(async () => {
      const outcome = await sendPasswordChangedNotice(target);
      if (!outcome.sent) console.error('Password changed email not sent:', outcome.error);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
