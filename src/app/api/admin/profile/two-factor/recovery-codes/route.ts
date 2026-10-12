import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import {
  accountEntityType,
  checkSecondStep,
  fieldsOf,
  newRecoveryCodes,
  ownAccount,
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
 * "New recovery codes" (TWO_FACTOR_PLAN.md 2.1, D3): all ten old codes stop
 * working and ten new ones are answered, once.
 *
 * It takes a current code (a recovery code counts), so an unlocked laptop left
 * open cannot be used to mint a set somebody walks away with. No email and no
 * sessions ended (D10): the account is no weaker than before.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const code = typedCode(body.code);
    if (!code) {
      return NextResponse.json(
        { errors: { code: 'Enter a code from your authenticator app, or a recovery code' } },
        { status: 400 },
      );
    }

    if (!allowCodeTry(actor)) return tooManyTries();

    const account = await ownAccount(actor);
    if (!account) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!twoFactorOn(fieldsOf(account))) {
      return NextResponse.json({ error: 'Two-step sign-in is off.' }, { status: 409 });
    }

    const used = await checkSecondStep(account, code);
    if (!used) {
      await recordWrongCode(actor, account, 'making new recovery codes');
      return NextResponse.json({ errors: { code: WRONG_CODE_OR_RECOVERY } }, { status: 400 });
    }

    const { codes, hashes } = await newRecoveryCodes();
    await prisma.$transaction(async tx => {
      await writeAccount(tx, account, { recoveryCodes: hashes });
      await recordAudit(tx, actor, {
        action: 'auth.recovery_codes_renewed',
        entityType: accountEntityType(account),
        entityId: actor.id,
        summary: 'Made new recovery codes.',
      });
    });

    return NextResponse.json({ codes });
  } catch (error) {
    console.error('Failed to make new recovery codes:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
