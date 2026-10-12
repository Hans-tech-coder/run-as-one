import { after, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { reissueAuthCookie, verifyPassword } from '@/lib/auth';
import { getActor, reissuedSessionClaims, sessionsCutoff } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { sendTwoStepOffEmail } from '@/lib/email-password';
import {
  accountEntityType,
  checkSecondStep,
  fieldsOf,
  ownAccount,
  TWO_FACTOR_OFF,
  twoFactorOn,
  writeAccount,
} from '@/lib/two-factor';
import {
  allowCodeTry,
  recordWrongCode,
  tooManyTries,
  typedCode,
  WRONG_CODE_OR_RECOVERY,
} from '../shared';

/**
 * Turning two-step sign-in off (TWO_FACTOR_PLAN.md 2.1).
 *
 * **It takes the current password and a current code** (D6), a recovery code
 * counting as one. Either alone is not enough: a borrowed unlocked laptop has
 * neither, and somebody who learned the password still lacks the phone. A
 * Google-only account with no password cannot turn it off here, the same rule
 * as unlinking Google — it sets a password first through "Forgot password?".
 *
 * The password is checked first so a mistyped password never spends a
 * recovery code. Off clears all four columns, ends every other session (D9)
 * and reissues this one, and emails the person (D10), since a weaker account
 * is the change someone who did not make it must hear about.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    const code = typedCode(body.code);

    const errors: Record<string, string> = {};
    if (!password) errors.password = 'Enter your current password';
    if (!code) errors.code = 'Enter a code from your authenticator app, or a recovery code';
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    if (!allowCodeTry(actor)) return tooManyTries();

    const account = await ownAccount(actor);
    if (!account) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!twoFactorOn(fieldsOf(account))) {
      return NextResponse.json({ error: 'Two-step sign-in is already off.' }, { status: 409 });
    }

    const hash = account.kind === 'ORGANIZER' ? account.organizer.password : account.staff.password;
    if (!hash) {
      return NextResponse.json(
        {
          errors: {
            password:
              'This account has no password yet. Set one with "Forgot password?" on the sign-in page, then turn this off.',
          },
        },
        { status: 400 },
      );
    }
    if (!(await verifyPassword(password, hash))) {
      return NextResponse.json(
        { errors: { password: 'That is not your current password' } },
        { status: 400 },
      );
    }

    const used = await checkSecondStep(account, code);
    if (!used) {
      await recordWrongCode(actor, account, 'turning it off');
      return NextResponse.json({ errors: { code: WRONG_CODE_OR_RECOVERY } }, { status: 400 });
    }

    const turnedOffAt = new Date();
    await prisma.$transaction(async tx => {
      await writeAccount(tx, account, { ...TWO_FACTOR_OFF, sessionsValidFrom: sessionsCutoff() });
      await recordAudit(tx, actor, {
        action: 'auth.two_factor_disabled',
        entityType: accountEntityType(account),
        entityId: actor.id,
        summary: 'Turned off two-step sign-in.',
        changes: { with: used },
      });
    });

    await reissueAuthCookie(reissuedSessionClaims(actor));

    const { email, name } = account.kind === 'ORGANIZER' ? account.organizer : account.staff;
    after(async () => {
      const outcome = await sendTwoStepOffEmail({ to: email, name, turnedOffAt });
      if (!outcome.sent) console.error('Two-step off email not sent:', outcome.error);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to turn off two-step sign-in:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
