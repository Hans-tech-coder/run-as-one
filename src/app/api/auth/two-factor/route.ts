import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { issuedBefore } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { linkGoogle } from '@/lib/google-oauth';
import { checkSignIn, finishSignIn, signInSubject } from '@/lib/sign-in';
import { SIGN_IN_ERRORS, type SignInErrorCode } from '@/lib/sign-in-errors';
import { LOGIN_RULE, TWO_FACTOR_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import {
  accountEntityType,
  checkSecondStep,
  fieldsOf,
  ownAccount,
  tooManyWrongCodes,
  twoFactorOn,
} from '@/lib/two-factor';
import {
  clearPendingTwoFactor,
  countWrongCode,
  readPendingTwoFactor,
} from '@/lib/two-factor-pending';
import { typedCode, WRONG_CODE_OR_RECOVERY } from '@/app/api/admin/profile/two-factor/shared';

/**
 * The second sign-in step (TWO_FACTOR_PLAN.md 3.3): the code page sends an
 * authenticator code or a recovery code, and a right one finishes the sign-in
 * the pending cookie (lib/two-factor-pending.ts) was holding.
 *
 * In order: the pending cookie must be valid; **the account is checked again**
 * (`signInSubject` + `checkSignIn`), since it may have been suspended while
 * the code page sat open; then the code (`checkSecondStep`, which spends it).
 * On success the cookie goes, the session is set with the door and length the
 * first step chose, the sign-in row records `twoFactor: 'totp' | 'recovery'`,
 * and the answer is where to go. A first Google sign-in's link is written
 * only now, after the whole sign-in has passed.
 *
 * **Throttled four ways**: per address (`LOGIN_RULE`), per account across
 * every code-taking route (`TWO_FACTOR_RULE`, the bucket Settings › Security
 * uses), per account from the database (`tooManyWrongCodes`: TWO_FACTOR_RULE's
 * count of wrong codes, read from the trail, so it holds across instances),
 * and five wrong codes on one pending sign-in send the person back to sign in.
 * Every wrong code is audited `auth.two_factor_failed`.
 *
 * A refusal the page must turn into a trip back to sign-in answers `code`, a
 * key of lib/sign-in-errors.ts; a wrong code answers `errors.code` and keeps
 * the person on the page.
 */

function backToSignIn(code: SignInErrorCode, status: number) {
  return NextResponse.json({ code, error: SIGN_IN_ERRORS[code] }, { status });
}

export async function POST(request: Request) {
  if (!allowRequest('two-factor-sign-in', callerKey(request), LOGIN_RULE)) {
    return NextResponse.json({ error: SIGN_IN_ERRORS.throttled }, { status: 429 });
  }

  try {
    const pending = await readPendingTwoFactor();
    if (!pending) return backToSignIn('two_factor_expired', 401);

    const body = await request.json().catch(() => ({}));
    const code = typedCode(body.code);
    if (!code) {
      return NextResponse.json(
        { errors: { code: 'Enter the 6-digit code from your authenticator app' } },
        { status: 400 },
      );
    }

    const account = await ownAccount(pending);
    const subject = account ? await signInSubject(account) : null;
    if (!account || !subject) {
      await clearPendingTwoFactor();
      return backToSignIn('two_factor_expired', 401);
    }

    const check = await checkSignIn(subject, { method: pending.method });
    if (!check.ok) {
      await clearPendingTwoFactor();
      return backToSignIn(check.code, check.status);
    }

    // Turned off or reset by an admin since the password was typed: the
    // pending sign-in no longer matches the account, so it starts over.
    if (!twoFactorOn(fieldsOf(account))) {
      await clearPendingTwoFactor();
      return backToSignIn('two_factor_expired', 401);
    }

    // Begun before every session was ended (a password reset, "Sign out other
    // devices"): the first step it proved no longer counts, so it starts over
    // with the new password (Strix vuln-0001).
    const validFrom =
      account.kind === 'ORGANIZER' ? account.organizer.sessionsValidFrom : account.staff.sessionsValidFrom;
    if (validFrom && issuedBefore(pending.iat, validFrom)) {
      await clearPendingTwoFactor();
      return backToSignIn('two_factor_expired', 401);
    }

    if (
      !allowRequest('two-factor', `${pending.kind}:${pending.id}`, TWO_FACTOR_RULE) ||
      (await tooManyWrongCodes(pending.id))
    ) {
      return NextResponse.json(
        { error: 'Too many codes in a few minutes. Wait five minutes, then try again.' },
        { status: 429 },
      );
    }

    const entity = { entityType: accountEntityType(account), entityId: pending.id };
    const used = await checkSecondStep(account, code);
    if (!used) {
      await recordAudit(db, check.subject.who, {
        ...entity,
        action: 'auth.two_factor_failed',
        summary: 'Entered a wrong two-step code (signing in).',
        changes: pending.method === 'google' ? { method: 'google' } : undefined,
      });
      if (!(await countWrongCode(pending))) return backToSignIn('two_factor_tries', 401);
      return NextResponse.json({ errors: { code: WRONG_CODE_OR_RECOVERY } }, { status: 400 });
    }

    await clearPendingTwoFactor();
    await finishSignIn(check.subject, { method: pending.method, keep: pending.keep, twoFactor: used });

    let recoveryCodesLeft: number | undefined;
    if (used === 'recovery') {
      recoveryCodesLeft = Math.max(0, fieldsOf(account).recoveryCodes.length - 1);
      await recordAudit(db, check.subject.who, {
        ...entity,
        action: 'auth.recovery_code_used',
        summary: `Signed in with a recovery code (${recoveryCodesLeft} left).`,
        changes: { left: recoveryCodesLeft },
      });
    }

    if (pending.linkSub && check.subject.kind === 'STAFF') {
      await linkGoogle(check.subject.staff.id, pending.linkSub, check.subject.who);
    }

    return NextResponse.json({ next: pending.next, recoveryCodesLeft });
  } catch (error) {
    console.error('Two-step sign-in error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
