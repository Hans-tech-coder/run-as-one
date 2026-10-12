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
import { completeSignIn, signInSubject } from '@/lib/sign-in';
import { safeNextPath } from '@/lib/next-path';
import { LOGIN_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { backToSignIn } from '../login-redirect';

/**
 * "Continue with Google", step two: Google sends the browser back here.
 *
 * In order: the `state` must match the cookie this browser was given (the
 * cookie is deleted either way); the code is exchanged and the ID token
 * verified; the account is found by its linked `sub` or, the first time, by
 * its verified email (`googleSignInAccount`); then `completeSignIn` decides,
 * exactly as it does for a password. A first sign-in that passes links the
 * `sub` to the account. Every refusal goes back to the sign-in page as a code.
 *
 * Throttled per address like the password route: each callback costs a call
 * to Google and a database read.
 */
export async function GET(request: Request) {
  if (!allowRequest('google-callback', callerKey(request), LOGIN_RULE)) {
    return backToSignIn(request, 'throttled');
  }

  const url = new URL(request.url);
  const pending = await takePendingSignIn(url.searchParams.get('state'));
  if (!pending) {
    return backToSignIn(request, 'google_failed');
  }
  const next = safeNextPath(pending.next);

  const googleError = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (googleError || !code) {
    return backToSignIn(request, googleError === 'access_denied' ? 'google_cancelled' : 'google_failed', next);
  }

  try {
    const idToken = await exchangeCode(code, pending.verifier, `${url.origin}${GOOGLE_CALLBACK_PATH}`);
    const identity = await verifyIdToken(idToken, pending.nonce);
    const { staff, link } = await googleSignInAccount(identity);

    const subject = await signInSubject({ kind: 'STAFF', staff });
    if (!subject) return backToSignIn(request, 'google_no_account', next);

    const result = await completeSignIn(subject, { method: 'google' });
    if (!result.ok) return backToSignIn(request, result.code, next);

    if (link && subject.who) await linkGoogle(staff.id, identity.sub, subject.who);

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
