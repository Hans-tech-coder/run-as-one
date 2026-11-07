import { NextResponse } from 'next/server';
import {
  GOOGLE_CALLBACK_PATH,
  GoogleSignInError,
  exchangeCode,
  googleSignInAccount,
  linkGoogle,
  takePendingSignIn,
  verifyIdToken,
} from '@/lib/google-oauth';
import { checkSignIn, finishSignIn, signInSubject } from '@/lib/sign-in';
import { twoFactorOn } from '@/lib/two-factor';
import { startPendingTwoFactor } from '@/lib/two-factor-pending';
import { safeNextPath } from '@/lib/next-path';
import { LOGIN_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { getActor } from '@/lib/actor';
import { confirmGoogleStepUp } from '@/lib/step-up';
import { backToSignIn } from '../login-redirect';
import { stepUpPopup } from '../step-up/popup';

/**
 * "Continue with Google", step two: Google sends the browser back here.
 *
 * In order: the `state` must match the cookie this browser was given (the
 * cookie is deleted either way); the code is exchanged and the ID token
 * verified; the account is found by its linked `sub` or, the first time, by
 * its verified email (`googleSignInAccount`); then `checkSignIn` decides,
 * exactly as it does for a password. A first sign-in that passes links the
 * `sub` to the account. Every refusal goes back to the sign-in page as a code.
 *
 * **Google asks for the code too** (TWO_FACTOR_PLAN.md D2): an account with
 * two-step sign-in on gets the pending cookie and goes to `/admin/two-factor`
 * instead of a session, so Google is no way around it. A first sign-in's
 * `sub` rides in that cookie and is linked by the code route, only once the
 * code is right.
 *
 * Throttled per address like the password route: each callback costs a call
 * to Google and a database read.
 *
 * **A step-up confirmation comes back here too** (lib/step-up.ts, started by
 * `/api/auth/google/step-up`), so no second redirect URI has to be registered
 * with Google. Its pending cookie carries `stepUp`, and that branch is decided
 * before anything sign-in does: it answers the popup page, and **never calls
 * `finishSignIn`, links a `sub`, or touches the session cookie** — the
 * signed-in session stays exactly as it was, and a Google account that is not
 * this person's own proves nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pending = await takePendingSignIn(url.searchParams.get('state'));
  if (!allowRequest('google-callback', callerKey(request), LOGIN_RULE)) {
    return pending?.stepUp
      ? stepUpPopup({ type: 'step-up', ref: pending.stepUp.ref, ok: false, error: 'Too many tries. Wait a minute, then try again.' })
      : backToSignIn(request, 'throttled');
  }
  if (!pending) {
    return backToSignIn(request, 'google_failed');
  }
  const googleError = url.searchParams.get('error');
  const code = url.searchParams.get('code');

  if (pending.stepUp) {
    const { ref } = pending.stepUp;
    const fail = (error: string) => stepUpPopup({ type: 'step-up', ref, ok: false, error });
    if (googleError || !code) {
      return fail(googleError === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google did not confirm. Try again.');
    }
    try {
      const actor = await getActor();
      if (!actor) return fail('Your session has ended. Sign in again.');
      const idToken = await exchangeCode(code, pending.verifier, `${url.origin}${GOOGLE_CALLBACK_PATH}`);
      const identity = await verifyIdToken(idToken, pending.nonce);
      const result = await confirmGoogleStepUp(actor, pending.stepUp, identity);
      return result.ok
        ? stepUpPopup({ type: 'step-up', ref, ok: true, token: result.token, expiresAt: result.expiresAt })
        : fail(result.error);
    } catch (error) {
      if (error instanceof GoogleSignInError) {
        console.warn('Google step-up refused:', error.message);
        return fail(error.code === 'google_unverified' ? 'Google has not verified that email address.' : 'Google did not confirm. Try again.');
      }
      console.error('Google step-up error:', error);
      return fail('Google did not confirm. Try again.');
    }
  }

  const next = safeNextPath(pending.next);
  if (googleError || !code) {
    return backToSignIn(request, googleError === 'access_denied' ? 'google_cancelled' : 'google_failed', next);
  }

  try {
    const idToken = await exchangeCode(code, pending.verifier, `${url.origin}${GOOGLE_CALLBACK_PATH}`);
    const identity = await verifyIdToken(idToken, pending.nonce);
    const { staff, link } = await googleSignInAccount(identity);

    const subject = await signInSubject({ kind: 'STAFF', staff });
    if (!subject) return backToSignIn(request, 'google_no_account', next);

    const check = await checkSignIn(subject, { method: 'google' });
    if (!check.ok) return backToSignIn(request, check.code, next);

    if (twoFactorOn(staff)) {
      await startPendingTwoFactor({
        kind: 'STAFF',
        id: staff.id,
        method: 'google',
        keep: pending.keep,
        next,
        ...(link ? { linkSub: identity.sub } : {}),
      });
      return NextResponse.redirect(new URL('/admin/two-factor', request.url));
    }

    await finishSignIn(check.subject, { method: 'google', keep: pending.keep });
    if (link) await linkGoogle(staff.id, identity.sub, check.subject.who);

    return NextResponse.redirect(new URL(next, request.url));
  } catch (error) {
    if (error instanceof GoogleSignInError) {
      console.warn('Google sign-in refused:', error.message);
      return backToSignIn(request, error.code, next);
    }
    console.error('Google sign-in error:', error);
    return backToSignIn(request, 'google_failed', next);
  }
}
