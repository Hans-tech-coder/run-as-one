/**
 * "Continue with Google": proving who a person is through Google, for staff
 * and client viewers (LOGIN_UX_PLAN.md Batch 3). The owner signs in with a
 * password only (D5).
 *
 * **Google never creates an account.** It only signs in to a StaffAccount that
 * already exists — found by the `googleSub` linked to it, or on the first use
 * by an email Google says is verified, which then links that `sub`. What
 * happens after the proof is `completeSignIn` (lib/sign-in.ts), the same as for
 * a password, so Google cannot let in anybody a password would not.
 *
 * **What makes a Google answer trustworthy here:**
 * - `state` — random, kept in a short-lived httpOnly cookie and compared with
 *   what Google sends back, so a callback this browser did not start (somebody
 *   else's code, slipped into a link) is refused.
 * - PKCE (S256) — the code is worthless without the verifier, which never
 *   leaves this server and that cookie.
 * - `nonce` — inside the signed ID token, so a token minted for another sign-in
 *   cannot be replayed into this one.
 * - The ID token is verified against Google's published keys (`jose`): issuer,
 *   audience (our client id), expiry, nonce, and `email_verified === true`.
 *
 * Hand-rolled rather than NextAuth / Auth.js, which would bring its own
 * session and fight the custom JWT and `getActor()`.
 */

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Prisma, type StaffAccount } from '@prisma/client';
import db from './db';
import { findAccountByEmail } from './actor';
import { recordAudit, type AuditActor } from './audit';
import type { SignInErrorCode } from './sign-in-errors';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Holds state, nonce, the PKCE verifier and the page to return to. */
const PENDING_COOKIE = 'google_oauth';
const PENDING_MAX_AGE = 10 * 60;

export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';

/** A refusal the sign-in page has a sentence for (lib/sign-in-errors.ts). */
export class GoogleSignInError extends Error {
  constructor(readonly code: SignInErrorCode, detail?: string) {
    super(detail ?? code);
  }
}

/** Both halves of the OAuth client are set. Without them the button is not shown. */
export function googleSignInConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new GoogleSignInError('google_unavailable', 'GOOGLE_CLIENT_ID is not set');
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new GoogleSignInError('google_unavailable', 'GOOGLE_CLIENT_SECRET is not set');
  return secret;
}

const random = () => randomBytes(32).toString('base64url');

/** `keep` is the "Keep me signed in" box, carried through Google to the callback. */
type PendingSignIn = { state: string; nonce: string; verifier: string; next: string; keep: boolean };

/**
 * Where to send the browser to start a Google sign-in. Writes the pending
 * cookie as a side effect; `next` must already have been through
 * `safeNextPath`.
 */
export async function googleAuthUrl({
  redirectUri,
  next,
  keep,
}: {
  redirectUri: string;
  next: string;
  keep: boolean;
}): Promise<string> {
  const pending: PendingSignIn = { state: random(), nonce: random(), verifier: random(), next, keep };

  const cookieStore = await cookies();
  cookieStore.set(PENDING_COOKIE, Buffer.from(JSON.stringify(pending)).toString('base64url'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax, not strict: Google's redirect back is a top-level navigation from
    // another site, and a strict cookie would not ride along with it.
    sameSite: 'lax',
    maxAge: PENDING_MAX_AGE,
    path: GOOGLE_CALLBACK_PATH,
  });

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: createHash('sha256').update(pending.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    // A shared race-day laptop is often signed in to somebody else's Google.
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

/**
 * The pending sign-in this browser started, if `state` is the one it was
 * given. The cookie is deleted either way: a state is good for one callback.
 */
export async function takePendingSignIn(state: string | null): Promise<PendingSignIn | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PENDING_COOKIE)?.value;
  cookieStore.delete({ name: PENDING_COOKIE, path: GOOGLE_CALLBACK_PATH });
  if (!raw || !state) return null;

  try {
    const pending = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as PendingSignIn;
    if (typeof pending.state !== 'string' || pending.state !== state) return null;
    if (typeof pending.nonce !== 'string' || typeof pending.verifier !== 'string') return null;
    return { ...pending, keep: pending.keep === true };
  } catch {
    return null;
  }
}

/** Trade the code Google sent back for the ID token. */
export async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
  if (!res.ok || typeof body.id_token !== 'string') {
    throw new GoogleSignInError('google_failed', `token exchange failed: ${res.status} ${String(body.error ?? '')}`);
  }
  return body.id_token;
}

/** Who Google says this is. Throws unless every check in the header passes. */
export async function verifyIdToken(
  idToken: string,
  nonce: string,
): Promise<{ sub: string; email: string }> {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, JWKS, { issuer: ISSUERS, audience: clientId() }));
  } catch (error) {
    throw new GoogleSignInError('google_failed', `ID token rejected: ${(error as Error).message}`);
  }

  if (payload.nonce !== nonce) {
    throw new GoogleSignInError('google_failed', 'nonce mismatch');
  }
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string') {
    throw new GoogleSignInError('google_failed', 'ID token has no sub or email');
  }
  if (payload.email_verified !== true) {
    throw new GoogleSignInError('google_unverified');
  }
  return { sub: payload.sub, email: payload.email };
}

/**
 * The StaffAccount a verified Google identity signs in to, in this order:
 *
 * 1. the account already linked to this `sub` — whatever its email says now,
 *    so changing the email in Settings does not break Google sign-in;
 * 2. otherwise the account with this email, if no Google account is linked to
 *    it yet — `link` is true, and the caller links it once the sign-in passes;
 * 3. an account with this email linked to a *different* `sub` is refused;
 * 4. no account is refused — Google never creates one. The owner's Organizer
 *    row is answered the same way (D5: the owner signs in with a password).
 *
 * An invitation not yet accepted is refused too: the person accepts it and
 * chooses a password first (D6).
 */
export async function googleSignInAccount({
  sub,
  email,
}: {
  sub: string;
  email: string;
}): Promise<{ staff: StaffAccount; link: boolean }> {
  const linked = await db.staffAccount.findUnique({ where: { googleSub: sub } });

  let staff: StaffAccount;
  let link = false;
  if (linked) {
    staff = linked;
  } else {
    const account = await findAccountByEmail(email);
    if (!account || account.kind === 'ORGANIZER') {
      throw new GoogleSignInError('google_no_account');
    }
    if (account.staff.googleSub) {
      throw new GoogleSignInError('google_other_account');
    }
    staff = account.staff;
    link = true;
  }

  if (!staff.password) {
    throw new GoogleSignInError('google_invite_pending');
  }
  return { staff, link };
}

/**
 * Write the first link between an account and a Google `sub`, with its trail
 * row. Only ever after `completeSignIn` has let the person in, so a suspended
 * or archived account is never linked by an attempt that was refused anyway.
 * Conditional on the column still being empty: two first sign-ins racing each
 * other link once, and the loser's sign-in still stands — it proved the same
 * verified email.
 */
export async function linkGoogle(staffId: string, sub: string, who: AuditActor) {
  try {
    await db.$transaction(async tx => {
      const { count } = await tx.staffAccount.updateMany({
        where: { id: staffId, googleSub: null },
        data: { googleSub: sub },
      });
      if (count === 0) return;
      await recordAudit(tx, who, {
        action: 'auth.google_linked',
        entityType: 'StaffAccount',
        entityId: staffId,
        summary: 'Linked a Google account for sign-in.',
      });
    });
  } catch (error) {
    // The same `sub` linked to another row in the meantime (unique index).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    throw error;
  }
}
