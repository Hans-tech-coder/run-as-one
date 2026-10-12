import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import prisma from '@/lib/db';
import { getActor } from '@/lib/actor';
import { sealingConfigured, sealSecret } from '@/lib/secret-box';
import { newTotpSecret, totpUri } from '@/lib/totp';
import { fieldsOf, ownAccount, twoFactorOn, writeAccount } from '@/lib/two-factor';

/**
 * Step 1 of turning on two-step sign-in (TWO_FACTOR_PLAN.md 2.1): a fresh
 * secret, sealed and stored **unconfirmed**, answered as a QR code and as text
 * for typing in by hand.
 *
 * Unconfirmed means it counts for nothing (`twoFactorOn`): sign-in ignores it
 * until `confirm` proves the app holds it. So pressing the button twice, or
 * walking away halfway, only overwrites or leaves a dead secret — never a
 * lock-out. Refused once it is on: a new secret then would silently replace
 * the one the person's phone holds.
 *
 * The QR is drawn here as an SVG string (D8), so the secret never goes to a
 * third-party QR service and the page needs no client library.
 */
export async function POST() {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sealingConfigured()) {
      return NextResponse.json(
        { error: 'Two-step sign-in is not set up on this server yet.' },
        { status: 503 },
      );
    }

    const account = await ownAccount(actor);
    if (!account) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (twoFactorOn(fieldsOf(account))) {
      return NextResponse.json({ error: 'Two-step sign-in is already on.' }, { status: 409 });
    }

    const secret = newTotpSecret();
    await writeAccount(prisma, account, {
      totpSecret: sealSecret(secret),
      totpConfirmedAt: null,
      totpLastStep: null,
      recoveryCodes: [],
    });

    const qrSvg = await QRCode.toString(totpUri({ secret, email: actor.email }), {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    return NextResponse.json({
      qrSvg,
      // Grouped in fours: what a person can read off a screen and type.
      secret: secret.match(/.{1,4}/g)?.join(' ') ?? secret,
    });
  } catch (error) {
    console.error('Failed to start two-step sign-in:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
