/**
 * What happens once a person has proved who they are — by a password
 * (`api/auth/login`) or by Google (`api/auth/google/callback`). The proof
 * differs; **who may sign in does not**, so both doors call `checkSignIn`
 * (the refusals) and `finishSignIn` (the trail row and the cookie) — together
 * `completeSignIn` — and neither can drift into letting in somebody the other
 * refuses.
 *
 * - **Only Run As One's Organizer row signs in as an owner**
 *   (`signInSubject` answers null for any other, and the caller treats that
 *   exactly like an address with no account). Its status is still an
 *   allowlist (`organizerOwnerCanSignIn`).
 * - **Staff and client viewers** need to be not suspended and to hold a
 *   membership that is accepted, not suspended, and inside an active
 *   organizer (`activeMembershipWhere`). A viewer whose client was archived
 *   gets its own sentence, because it has no organizer to go and ask.
 * - **Every refusal of a known account and every sign-in goes in the trail**
 *   (STAFF_ACCESS_PLAN.md §4.3), with `method: 'google'` in `changes` when
 *   Google was the proof. A refused attempt is written into the earliest
 *   accepted membership's trail even when none is usable any more.
 * - A sign-in stamps `lastLoginAt` and sets the session cookie.
 */

import type { Organizer, StaffAccount } from '@prisma/client';
import db from './db';
import { createToken, setAuthCookie } from './auth';
import {
  activeMembershipWhere,
  organizerSessionClaims,
  staffSessionClaims,
  type AccountByEmail,
} from './actor';
import { recordAudit, type AuditActor } from './audit';
import { RUN_AS_ONE_ORGANIZER_ID, organizerOwnerCanSignIn } from './organizer-status';
import { SIGN_IN_ERRORS, type SignInErrorCode } from './sign-in-errors';

export type SignInMethod = 'password' | 'google';

type MembershipPick = { organizerId: string; role: string };

/** An account that may be signed in to, with the trail its attempts go in. */
export type SignInSubject =
  | { kind: 'ORGANIZER'; organizer: Organizer; who: AuditActor }
  | {
      kind: 'STAFF';
      staff: StaffAccount;
      /** Null when the person has never accepted any membership: no trail to write in. */
      who: AuditActor | null;
      /** The membership this sign-in lands in, or null when none is usable. */
      membership: MembershipPick | null;
      /** The earliest accepted membership, looked up only when `membership` is null. */
      acceptedMembership: MembershipPick | null;
    };

export type SignInOutcome =
  | 'WRONG_PASSWORD'
  | 'SUSPENDED'
  | 'NOT_APPROVED'
  | 'NO_ACTIVE_ORGANIZER';

export type SignInRefusal = { ok: false; status: number; code: SignInErrorCode; error: string };

export type SignInResult = { ok: true; role: 'OWNER' | 'STAFF' } | SignInRefusal;

const refused = (code: SignInErrorCode): SignInRefusal => ({
  ok: false,
  status: 403,
  code,
  error: SIGN_IN_ERRORS[code],
});

/**
 * The account behind an address, ready to be signed in to — or null for an
 * Organizer row that is not Run As One's. The retired super admin and the
 * applicant rows of the self-serve days are answered exactly like an address
 * with no account — not logged, and never told the address exists — because
 * an owner session on any of them would hold platform:manage over an empty
 * tenant of its own.
 */
export async function signInSubject(account: AccountByEmail): Promise<SignInSubject | null> {
  if (account.kind === 'ORGANIZER') {
    const organizer = account.organizer;
    if (organizer.id !== RUN_AS_ONE_ORGANIZER_ID) return null;
    return {
      kind: 'ORGANIZER',
      organizer,
      who: {
        kind: 'OWNER',
        id: organizer.id,
        orgId: organizer.id,
        name: organizer.name,
        email: organizer.email,
      },
    };
  }

  const staff = account.staff;

  // The organizer this sign-in lands in: the earliest membership that is
  // accepted, not suspended, and inside an active organizer. Run As One is
  // the one tenant (ADMIN_MERGE_PLAN.md), so there is no switching once
  // signed in; a membership elsewhere being suspended still does not stop
  // this one.
  const membership = await db.staffMembership.findFirst({
    where: activeMembershipWhere(staff.id),
    orderBy: { acceptedAt: 'asc' },
    select: { organizerId: true, role: true },
  });

  // A refused attempt still needs an organizer's trail to be written into,
  // even when none of this person's memberships is usable any more — a run
  // of wrong passwords against a suspended validator is exactly what an
  // owner reviewing an incident wants to see.
  const acceptedMembership = membership
    ? null
    : await db.staffMembership.findFirst({
        where: { staffId: staff.id, acceptedAt: { not: null } },
        orderBy: { acceptedAt: 'asc' },
        select: { organizerId: true, role: true },
      });
  const trailOrganizerId = membership?.organizerId ?? acceptedMembership?.organizerId;

  const who: AuditActor | null = trailOrganizerId
    ? {
        kind: 'STAFF',
        id: staff.id,
        orgId: trailOrganizerId,
        name: staff.name,
        email: staff.email,
      }
    : null;

  return { kind: 'STAFF', staff, who, membership, acceptedMembership };
}

const FAILURE_SUMMARIES: Record<SignInOutcome, string> = {
  WRONG_PASSWORD: 'Failed sign-in: wrong password.',
  SUSPENDED: 'Sign-in refused: the account is suspended.',
  NOT_APPROVED: 'Sign-in refused: the account is not approved.',
  NO_ACTIVE_ORGANIZER: 'Sign-in refused: no active organizer to sign in to.',
};

/** A refused attempt on a known account, in its trail. Silent when it has none. */
export async function logSignInFailure(
  subject: SignInSubject,
  outcome: SignInOutcome,
  method: SignInMethod,
) {
  if (!subject.who) return;
  await recordAudit(db, subject.who, {
    action: 'auth.sign_in_failed',
    entityType: subject.kind === 'ORGANIZER' ? 'Organizer' : 'StaffAccount',
    entityId: subject.who.id,
    summary: FAILURE_SUMMARIES[outcome],
    changes: method === 'google' ? { reason: outcome, method } : { reason: outcome },
  });
}

/** A subject `checkSignIn` let through: for staff, with the membership it lands in. */
export type CheckedSubject =
  | Extract<SignInSubject, { kind: 'ORGANIZER' }>
  | { kind: 'STAFF'; staff: StaffAccount; who: AuditActor; membership: MembershipPick };

export type SignInCheck =
  | { ok: true; subject: CheckedSubject }
  | SignInRefusal;

/**
 * Whether an account whose proof has already been checked may sign in: refuse
 * it with the code and sentence the sign-in page shows (lib/sign-in-errors.ts),
 * writing the refusal in its trail, or hand back the subject `finishSignIn`
 * takes. Writes nothing on success.
 */
export async function checkSignIn(
  subject: SignInSubject,
  { method }: { method: SignInMethod },
): Promise<SignInCheck> {
  // ── Run As One's own account, the owner ──────────────────────────────
  if (subject.kind === 'ORGANIZER') {
    // Still an allowlist (organizerOwnerCanSignIn): a status written by hand
    // is refused rather than let in.
    if (!organizerOwnerCanSignIn(subject.organizer)) {
      await logSignInFailure(subject, 'NOT_APPROVED', method);
      return refused('not_approved');
    }
    return { ok: true, subject };
  }

  // ── A member of an organizer's staff ─────────────────────────────────
  const { staff, who, membership, acceptedMembership } = subject;

  if (staff.status === 'SUSPENDED') {
    await logSignInFailure(subject, 'SUSPENDED', method);
    return refused('suspended');
  }

  if (!membership || !who) {
    await logSignInFailure(subject, 'NO_ACTIVE_ORGANIZER', method);
    // A client's own sign-in whose client was archived (ADMIN_MERGE_PLAN.md,
    // Batch 4). It has no organizer it works for, so the team's sentence
    // would send it to ask somebody who does not exist.
    return refused(acceptedMembership?.role === 'VIEWER' ? 'client_inactive' : 'no_active_organizer');
  }

  return { ok: true, subject: { kind: 'STAFF', staff, who, membership } };
}

/**
 * Sign in to a subject `checkSignIn` let through: stamp `lastLoginAt`, write
 * `auth.signed_in`, and set the cookie. `keep` is the "Keep me signed in" box:
 * a 30-day session instead of a day (SESSION_SECONDS, lib/jwt.ts), noted in
 * the trail row.
 */
export async function finishSignIn(
  subject: CheckedSubject,
  { method, keep = false }: { method: SignInMethod; keep?: boolean },
): Promise<{ ok: true; role: 'OWNER' | 'STAFF' }> {
  const length = keep ? 'keep' : 'day';
  const changes = {
    ...(method === 'google' ? { method } : {}),
    ...(keep ? { keepSignedIn: true } : {}),
  };
  const signedIn = {
    action: 'auth.signed_in' as const,
    summary: method === 'google' ? 'Signed in with Google.' : 'Signed in.',
    changes: Object.keys(changes).length ? changes : undefined,
  };

  if (subject.kind === 'ORGANIZER') {
    const { organizer, who } = subject;
    await db.$transaction(async tx => {
      await tx.organizer.update({
        where: { id: organizer.id },
        data: { lastLoginAt: new Date() },
      });
      await recordAudit(tx, who, { ...signedIn, entityType: 'Organizer', entityId: organizer.id });
    });

    await setAuthCookie(await createToken(organizerSessionClaims(organizer), length), length);
    return { ok: true, role: 'OWNER' };
  }

  const { staff, who, membership } = subject;
  await db.$transaction(async tx => {
    await tx.staffAccount.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });
    await recordAudit(tx, who, { ...signedIn, entityType: 'StaffAccount', entityId: staff.id });
  });

  await setAuthCookie(await createToken(staffSessionClaims(staff, membership), length), length);
  return { ok: true, role: 'STAFF' };
}

/** `checkSignIn`, then `finishSignIn`: a sign-in with no second step. */
export async function completeSignIn(
  subject: SignInSubject,
  { method, keep = false }: { method: SignInMethod; keep?: boolean },
): Promise<SignInResult> {
  const check = await checkSignIn(subject, { method });
  if (!check.ok) return check;
  return finishSignIn(check.subject, { method, keep });
}
