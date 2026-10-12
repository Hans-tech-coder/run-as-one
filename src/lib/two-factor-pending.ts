import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { SECRET_KEY } from './jwt';
import type { SignInMethod } from './sign-in';

/**
 * The sign-in that waits for its second step (TWO_FACTOR_PLAN.md Batch 3): a
 * person whose password or Google sign-in passed, and whose account has
 * two-step sign-in on, holds this instead of a session until the code page
 * (`/admin/two-factor`) takes a code.
 *
 * - **It is never a session, and a session is never it.** A JWT signed with
 *   the app's one secret and `purpose: 'two-factor'`, carrying the account as
 *   `sub` and `account`, never a session's `kind` or `id`, so `verifyToken`
 *   (lib/jwt.ts) refuses it; and a session carries no purpose, so it is
 *   refused here. Its own cookie name, too.
 * - **Five minutes**, httpOnly, `sameSite=lax` (the Google callback lands on
 *   the code page by a redirect from another site's navigation), path `/`.
 * - **It carries what the finished sign-in needs**: the door (`method`), the
 *   "Keep me signed in" box (`keep`), where to go (`next`), and for a first
 *   Google sign-in the `sub` to link once the whole sign-in has passed
 *   (`linkSub`) — never before.
 * - **Five wrong codes on one pending sign-in end it** (`tries`, re-signed
 *   with the same expiry on each wrong code). Replaying an older copy of the
 *   cookie wins nothing past `tooManyWrongCodes` (lib/two-factor.ts), which
 *   counts the account's wrong codes from the trail, whatever cookie or
 *   serverless instance they came through.
 * - It proves only the first step. The code route checks the account again
 *   (`signInSubject` + `checkSignIn`), because it may have been suspended in
 *   the minutes in between.
 */

const COOKIE = 'two_factor_pending';
const PURPOSE = 'two-factor';
const MAX_AGE_SECONDS = 5 * 60;
export const PENDING_MAX_TRIES = 5;

export type PendingTwoFactor = {
  /** The account, in the shape `ownAccount` (lib/two-factor.ts) reads. */
  kind: 'OWNER' | 'STAFF';
  id: string;
  method: SignInMethod;
  keep: boolean;
  next: string;
  linkSub?: string;
  tries: number;
  /** Seconds since the epoch, kept across re-signs. */
  exp: number;
};

async function writeCookie(pending: PendingTwoFactor) {
  const { id, exp, kind, ...claims } = pending;
  const token = await new SignJWT({ purpose: PURPOSE, account: kind, ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(SECRET_KEY);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Math.max(0, exp - Math.floor(Date.now() / 1000)),
    path: '/',
  });
}

/** Hold the sign-in at its second step. */
export async function startPendingTwoFactor(
  pending: Omit<PendingTwoFactor, 'tries' | 'exp'>,
): Promise<void> {
  await writeCookie({ ...pending, tries: 0, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS });
}

/** The pending sign-in this browser holds, or null for none, expired, forged or foreign. */
export async function readPendingTwoFactor(): Promise<PendingTwoFactor | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload: p } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
    if (p.purpose !== PURPOSE) return null;
    if (p.account !== 'OWNER' && p.account !== 'STAFF') return null;
    if (typeof p.sub !== 'string' || !p.sub || typeof p.exp !== 'number') return null;
    if (p.method !== 'password' && p.method !== 'google') return null;
    return {
      kind: p.account,
      id: p.sub,
      method: p.method,
      keep: p.keep === true,
      next: typeof p.next === 'string' ? p.next : '/admin',
      linkSub: typeof p.linkSub === 'string' ? p.linkSub : undefined,
      tries: typeof p.tries === 'number' ? p.tries : PENDING_MAX_TRIES,
      exp: p.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Counts a wrong code against the pending sign-in. False once it has had
 * PENDING_MAX_TRIES, and the cookie is then gone: back to sign-in.
 */
export async function countWrongCode(pending: PendingTwoFactor): Promise<boolean> {
  const tries = pending.tries + 1;
  if (tries >= PENDING_MAX_TRIES) {
    await clearPendingTwoFactor();
    return false;
  }
  await writeCookie({ ...pending, tries });
  return true;
}

export async function clearPendingTwoFactor(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: COOKIE, path: '/' });
}
