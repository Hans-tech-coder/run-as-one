import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { reissueAuthCookie } from '@/lib/auth';
import { getActor, reissuedSessionClaims, sessionsCutoff } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { openSecret } from '@/lib/secret-box';
import { verifyTotp } from '@/lib/totp';
import {
  accountEntityType,
  fieldsOf,
  newRecoveryCodes,
  ownAccount,
  twoFactorOn,
} from '@/lib/two-factor';
import { allowCodeTry, recordWrongCode, tooManyTries, typedCode, WRONG_CODE } from '../shared';

/**
 * Step 2 of turning on two-step sign-in (TWO_FACTOR_PLAN.md 2.1): the first
 * code from the app proves it holds the secret `start` stored, and only then
 * does the secret count.
 *
 * In one transaction: confirmed, the code's step spent, ten fresh recovery
 * codes stored as hashes, and **every other session ended** (D9) — a session
 * somebody already stole must not outlive the new protection. This one is
 * reissued, so the person who just proved themselves stays in. The ten codes
 * are answered here, once; nothing can show them again.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const code = typedCode(body.code);
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { errors: { code: 'Enter the 6-digit code from your authenticator app' } },
        { status: 400 },
      );
    }

    if (!allowCodeTry(actor)) return tooManyTries();

    const account = await ownAccount(actor);
    if (!account) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const fields = fieldsOf(account);
    if (twoFactorOn(fields)) {
      return NextResponse.json({ error: 'Two-step sign-in is already on.' }, { status: 409 });
    }
    const secret = fields.totpSecret;
    if (!secret) {
      return NextResponse.json(
        { error: 'This setup is no longer open. Start again with "Turn On Two-Step Sign-in".' },
        { status: 409 },
      );
    }

    const step = verifyTotp(openSecret(secret), code, null);
    if (step === null) {
      await recordWrongCode(actor, account, 'turning it on');
      return NextResponse.json({ errors: { code: WRONG_CODE } }, { status: 400 });
    }

    const { codes, hashes } = await newRecoveryCodes();
    const confirmed = await prisma.$transaction(async tx => {
      // Only the secret that was read: a second tab that pressed "start" in
      // between has put a different secret on screen, and this code does not
      // belong to it.
      const where = { id: fields.id, totpSecret: secret, totpConfirmedAt: null };
      const data = {
        totpConfirmedAt: new Date(),
        totpLastStep: step,
        recoveryCodes: hashes,
        sessionsValidFrom: sessionsCutoff(),
      };
      const result =
        account.kind === 'ORGANIZER'
          ? await tx.organizer.updateMany({ where, data })
          : await tx.staffAccount.updateMany({ where, data });
      if (result.count !== 1) return false;
      await recordAudit(tx, actor, {
        action: 'auth.two_factor_enabled',
        entityType: accountEntityType(account),
        entityId: actor.id,
        summary: 'Turned on two-step sign-in.',
      });
      return true;
    });
    if (!confirmed) {
      return NextResponse.json(
        { error: 'This setup changed in another tab. Start again with "Turn On Two-Step Sign-in".' },
        { status: 409 },
      );
    }

    await reissueAuthCookie(reissuedSessionClaims(actor));
    return NextResponse.json({ codes });
  } catch (error) {
    console.error('Failed to confirm two-step sign-in:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
