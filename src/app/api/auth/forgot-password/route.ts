import { NextResponse, after } from 'next/server';
import prisma from '@/lib/db';
import { findAccountByEmail } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { canResetPassword, newPasswordReset, sendResetLink } from '@/lib/password-reset';
import { PASSWORD_RESET_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { inviteOrigin } from '@/lib/team-invite';
import { normalizeAccountEmail } from '@/lib/text-case';

/**
 * Asking for a password-reset link — public, from `/admin/forgot-password`.
 * Who gets one is lib/password-reset.ts's rule.
 *
 * **Every address gets the same answer, in the same time.** An account that
 * gets a link, one that may not (suspended, invited but never accepted), and an
 * address nobody uses all read "check your email", so the form cannot be used
 * to learn who has an account. The email itself goes out in `after()`, once
 * the answer has left, so Resend's time is never on the clock; and the answer
 * is held to a floor (`ANSWER_FLOOR_MS`) so the few database writes a real
 * account costs do not show either.
 *
 * Throttled per address and per account email (`PASSWORD_RESET_RULE`); the
 * refusal does not depend on whether the address has an account.
 *
 * The trail records a link being made (`auth.password_reset_requested`). A
 * request that makes none is not written down: the addresses that may not
 * reset have no trail of their own to write into, or should not learn they do.
 */

const ANSWER_FLOOR_MS = 1000;

const SENT = () => NextResponse.json({ success: true });

const THROTTLED = () =>
  NextResponse.json(
    { error: 'Too many reset requests. Wait a few minutes, then try again.' },
    { status: 429 },
  );

async function holdUntil(startedAt: number, floorMs: number) {
  const left = startedAt + floorMs - Date.now();
  if (left > 0) await new Promise(resolve => setTimeout(resolve, left));
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  if (!allowRequest('forgot-password', callerKey(request), PASSWORD_RESET_RULE)) {
    return THROTTLED();
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeAccountEmail(body?.email);
  if (!email) {
    return NextResponse.json(
      { errors: { email: 'Enter the email address you sign in with' } },
      { status: 400 },
    );
  }

  if (!allowRequest('forgot-password-account', email, PASSWORD_RESET_RULE)) {
    return THROTTLED();
  }

  try {
    const account = await findAccountByEmail(email);
    const target = account ? await canResetPassword(account) : null;

    if (target) {
      const token = await newPasswordReset(target);
      await recordAudit(prisma, target.who, {
        action: 'auth.password_reset_requested',
        entityType: target.kind === 'ORGANIZER' ? 'Organizer' : 'StaffAccount',
        entityId: target.id,
        summary: 'Asked for a password reset link.',
      });

      const origin = inviteOrigin(request);
      after(async () => {
        const outcome = await sendResetLink({ target, token, origin });
        if (!outcome.sent) console.error('Password reset email not sent:', outcome.error);
      });
    }
  } catch (error) {
    // Still the generic answer: an error page only for real accounts would be
    // the very difference this route exists to hide.
    console.error('Forgot password error:', error);
  }

  await holdUntil(startedAt, ANSWER_FLOOR_MS);
  return SENT();
}
