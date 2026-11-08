/**
 * Step-up confirmation: a signed-in staff member proves it is still them right
 * before a dangerous action (PAYMENT_CORRECTION_PLAN.md C2a, Batch 0). A
 * session says who sat down at the laptop, maybe thirty days ago; it does not
 * say who is pressing Save now on a shared race-day machine.
 *
 * **Which proof an account gives** (`stepUpMethods`):
 * - two-step sign-in on → the 6-digit code, spent under lib/two-factor.ts's
 *   one-use step rule (`totpLastStep`). Nothing weaker is offered beside it —
 *   a password or Google alone would be a way around the code, as at sign-in.
 *   A recovery code is not taken: those are for a lost phone, not routine work.
 * - otherwise → the password (bcrypt, as sign-in checks it), and, for a staff
 *   account with a linked `googleSub`, **Confirm with Google** beside it: a
 *   Google sign-in forced again (`prompt=login`, `max_age`), accepted only
 *   when `auth_time` is fresh and the returned `sub` is this account's own
 *   `googleSub` (lib/google-oauth.ts). The owner has a password only.
 *
 * **What a proof buys** is one token: a JWT under the app's secret with
 * `purpose: 'step-up'`, never a session's `kind` claim, so `verifyToken`
 * refuses it and it refuses a session. It lives **five minutes** and is bound
 * to the account, an action name from `STEP_UP_ACTIONS` and one target id
 * (an order id). `consumeStepUp` is the only reader, and spends it.
 *
 * **One use, without a table of used ids.** Each account row keeps
 * `stepUpUsedAt`, the issue time (ms) of the newest token it spent; a token
 * is spent by a conditional update that moves the column forward only when
 * the token is newer, so a replay — or a race of two requests with one token —
 * matches no row. The cost: spending a newer token retires any older unspent
 * one, which only means asking again. Nothing to clean up, eight bytes a row.
 *
 * **Throttled and written down like sign-in.** Every failure writes
 * `auth.step_up_failed` and every success `auth.step_up_confirmed`; five
 * failures in five minutes (counted from the trail with the account's wrong
 * sign-in codes, so neither a fresh serverless instance nor switching between
 * the two doors resets it) and the account waits.
 */

import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Prisma } from '@prisma/client';
import db from './db';
import type { Actor, AccountByEmail } from './actor';
import { recordAudit } from './audit';
import { verifyNoPassword, verifyPassword } from './auth';
import { STEP_UP_MAX_AGE_SECONDS, googleSignInConfigured, type PendingStepUp } from './google-oauth';
import { SECRET_KEY } from './jwt';
import { STEP_UP_RULE, allowRequest } from './rate-limit';
import { accountEntityType, checkSecondStep, fieldsOf, ownAccount, twoFactorOn } from './two-factor';

const PURPOSE = 'step-up';
const TOKEN_SECONDS = 5 * 60;

/**
 * Every action a step-up can be asked for. A token names one, and an action
 * that is not here cannot be confirmed, so a token minted for one dangerous
 * thing never opens another.
 */
export const STEP_UP_ACTIONS = ['registration.correct-payment'] as const;
export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

/** What each action reads as in the trail ("…to correct an order's payment"). */
const ACTION_WORDS: Record<StepUpAction, string> = {
  'registration.correct-payment': "correct an order's payment",
};

export type StepUpMethod = 'code' | 'password' | 'google';

export function asStepUpAction(value: unknown): StepUpAction | null {
  return STEP_UP_ACTIONS.find(action => action === value) ?? null;
}

/** A target id is an id: short, no spaces. */
export function asStepUpTarget(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

/** The proofs this account can give, in the order the dialog offers them. */
export function stepUpMethods(account: AccountByEmail): StepUpMethod[] {
  if (twoFactorOn(fieldsOf(account))) return ['code'];
  if (account.kind === 'STAFF' && account.staff.googleSub && googleSignInConfigured()) {
    return ['password', 'google'];
  }
  return ['password'];
}

export type StepUpResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; status: 400 | 401 | 429; field?: 'code' | 'password'; error: string };

export const STEP_UP_TOO_MANY = 'Too many tries in a few minutes. Wait five minutes, then try again.';

/**
 * Whether the account may try now: the per-instance window, then the trail's
 * count of failed step-ups and wrong sign-in codes inside STEP_UP_RULE's
 * window. Every try counts against the first; only failures against the
 * second.
 */
export async function stepUpAllowed(actor: Pick<Actor, 'kind' | 'id'>, now = Date.now()): Promise<boolean> {
  if (!allowRequest('step-up', `${actor.kind}:${actor.id}`, STEP_UP_RULE)) return false;
  const failed = await db.auditLog.count({
    where: {
      actorId: actor.id,
      action: { in: ['auth.step_up_failed', 'auth.two_factor_failed'] },
      createdAt: { gte: new Date(now - STEP_UP_RULE.windowMs) },
    },
  });
  return failed < STEP_UP_RULE.limit;
}

const METHOD_WORDS: Record<StepUpMethod, string> = {
  code: 'two-step code',
  password: 'password',
  google: 'Google',
};

export async function recordStepUpFailure(
  actor: Actor,
  account: AccountByEmail,
  method: StepUpMethod,
  action: StepUpAction,
  targetId: string,
  why: string,
): Promise<void> {
  await recordAudit(db, actor, {
    action: 'auth.step_up_failed',
    entityType: accountEntityType(account),
    entityId: actor.id,
    summary: `Failed a security check (${METHOD_WORDS[method]}: ${why}) before trying to ${ACTION_WORDS[action]}.`,
    changes: { method, for: action, target: targetId },
  });
}

/**
 * Write the success row and mint the token. Exported for the Google callback,
 * which proves the person its own way and then lands here like the other two.
 */
export async function issueStepUp(
  actor: Actor,
  account: AccountByEmail,
  method: StepUpMethod,
  action: StepUpAction,
  targetId: string,
): Promise<{ token: string; expiresAt: number }> {
  const at = Date.now();
  const jti = randomUUID();
  const token = await new SignJWT({ purpose: PURPOSE, kind: actor.kind, action, target: targetId, at })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(actor.id)
    .setJti(jti)
    .setIssuedAt(Math.floor(at / 1000))
    .setExpirationTime(Math.floor(at / 1000) + TOKEN_SECONDS)
    .sign(SECRET_KEY);

  await recordAudit(db, actor, {
    action: 'auth.step_up_confirmed',
    entityType: accountEntityType(account),
    entityId: actor.id,
    summary: `Confirmed it was them (${METHOD_WORDS[method]}) to ${ACTION_WORDS[action]}.`,
    changes: { method, for: action, target: targetId, jti },
  });
  return { token, expiresAt: at + TOKEN_SECONDS * 1000 };
}

/**
 * Check a typed code or password for the signed-in person and, when it is
 * right, issue the token. The Google proof goes through the callback instead.
 */
export async function verifyStepUp(
  actor: Actor,
  input: { method: 'code' | 'password'; secret: string; action: StepUpAction; targetId: string },
): Promise<StepUpResult> {
  const account = await ownAccount(actor);
  if (!account) return { ok: false, status: 401, error: 'Your session has ended. Sign in again.' };

  const methods = stepUpMethods(account);
  if (!methods.includes(input.method)) {
    return {
      ok: false,
      status: 400,
      error: methods.includes('code')
        ? 'Two-step sign-in is on for your account, so confirm with the code from your authenticator app.'
        : 'Confirm with your password.',
    };
  }

  if (!(await stepUpAllowed(actor))) return { ok: false, status: 429, error: STEP_UP_TOO_MANY };

  const { method, secret, action, targetId } = input;

  if (method === 'code') {
    const code = secret.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) {
      return { ok: false, status: 400, field: 'code', error: 'Enter the 6-digit code from your authenticator app' };
    }
    if ((await checkSecondStep(account, code)) !== 'totp') {
      await recordStepUpFailure(actor, account, method, action, targetId, 'wrong code');
      return {
        ok: false,
        status: 400,
        field: 'code',
        error:
          'That code did not work. Use the newest code in your authenticator app, and check that your phone sets its time automatically.',
      };
    }
  } else {
    if (!secret) return { ok: false, status: 400, field: 'password', error: 'Enter your password' };
    const hash = account.kind === 'ORGANIZER' ? account.organizer.password : account.staff.password;
    const right = hash ? await verifyPassword(secret, hash) : await verifyNoPassword(secret);
    if (!right) {
      await recordStepUpFailure(actor, account, method, action, targetId, 'wrong password');
      return { ok: false, status: 400, field: 'password', error: 'That is not your password' };
    }
  }

  return { ok: true, ...(await issueStepUp(actor, account, method, action, targetId)) };
}

/** Clock skew allowed between Google's `auth_time` and this server. */
const AUTH_TIME_SKEW_MS = 30_000;

/**
 * How old Google's sign-in may be when the callback judges it, measured from
 * this server's clock, not from the pending cookie: that cookie is plain
 * base64 JSON, so its `startedAt` can be edited in the browser, and a
 * hand-built Google URL without `prompt=login` would otherwise pass with an
 * hours-old sign-in. Google re-signs the person in moments before the
 * redirect, so `max_age` plus the skew is plenty.
 */
const AUTH_TIME_MAX_AGE_MS = STEP_UP_MAX_AGE_SECONDS * 1000 + AUTH_TIME_SKEW_MS;

/**
 * The Google half: the callback has verified the ID token (issuer, audience,
 * nonce, expiry); this decides whether that sign-in confirms *this* person
 * now. The signed-in session must be the account that started it, Google must
 * have signed the person in after the dialog asked (`auth_time`, not just the
 * `prompt=login` we requested), and the Google account must be the one linked
 * to this staff account — a colleague's Google, signed in on the same laptop,
 * proves nothing about who holds this session.
 */
export async function confirmGoogleStepUp(
  actor: Actor,
  pending: PendingStepUp,
  identity: { sub: string; authTime: number | null },
): Promise<StepUpResult> {
  const action = asStepUpAction(pending.action);
  const targetId = asStepUpTarget(pending.target);
  if (actor.kind !== pending.kind || actor.id !== pending.id || !action || !targetId) {
    return { ok: false, status: 401, error: 'This confirmation was started from another sign-in. Try again.' };
  }
  const account = await ownAccount(actor);
  if (!account) return { ok: false, status: 401, error: 'Your session has ended. Sign in again.' };
  if (!stepUpMethods(account).includes('google')) {
    return { ok: false, status: 400, error: 'Confirm with your password instead.' };
  }
  if (!(await stepUpAllowed(actor))) return { ok: false, status: 429, error: STEP_UP_TOO_MANY };

  const now = Date.now();
  const signedInAt = identity.authTime === null ? null : identity.authTime * 1000;
  if (
    signedInAt === null ||
    signedInAt < pending.startedAt - AUTH_TIME_SKEW_MS ||
    signedInAt < now - AUTH_TIME_MAX_AGE_MS ||
    signedInAt > now + AUTH_TIME_SKEW_MS
  ) {
    await recordStepUpFailure(actor, account, 'google', action, targetId, 'Google did not ask for the sign-in again');
    return { ok: false, status: 401, error: 'Google did not ask you to sign in again. Try once more.' };
  }
  if (account.kind !== 'STAFF' || identity.sub !== account.staff.googleSub) {
    await recordStepUpFailure(actor, account, 'google', action, targetId, 'a different Google account');
    return {
      ok: false,
      status: 401,
      error: 'That Google account is not the one linked to your sign-in. Use your own, or confirm with your password.',
    };
  }
  return { ok: true, ...(await issueStepUp(actor, account, 'google', action, targetId)) };
}

type StepUpClient = Pick<Prisma.TransactionClient, 'organizer' | 'staffAccount'>;

/**
 * Verify a step-up token for this person, action and target, and spend it.
 * True once; false for a token that is missing, expired, forged, minted for
 * somebody or something else, or already spent (or older than one spent).
 *
 * Pass the caller's transaction client so the spend commits or rolls back
 * with the action it guards: a refused correction leaves the token good for
 * the retry, inside its five minutes.
 */
export async function consumeStepUp(
  token: unknown,
  expected: { actor: Pick<Actor, 'kind' | 'id'>; action: StepUpAction; targetId: string },
  client: StepUpClient = db,
): Promise<boolean> {
  if (typeof token !== 'string' || !token) return false;

  let payload;
  try {
    ({ payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] }));
  } catch {
    return false;
  }
  const { actor, action, targetId } = expected;
  if (
    payload.purpose !== PURPOSE ||
    payload.sub !== actor.id ||
    payload.kind !== actor.kind ||
    payload.action !== action ||
    payload.target !== targetId ||
    typeof payload.jti !== 'string' ||
    typeof payload.at !== 'number'
  ) {
    return false;
  }

  const at = new Date(payload.at);
  const where = { id: actor.id, OR: [{ stepUpUsedAt: null }, { stepUpUsedAt: { lt: at } }] };
  const result =
    actor.kind === 'OWNER'
      ? await client.organizer.updateMany({ where, data: { stepUpUsedAt: at } })
      : await client.staffAccount.updateMany({ where, data: { stepUpUsedAt: at } });
  return result.count === 1;
}
