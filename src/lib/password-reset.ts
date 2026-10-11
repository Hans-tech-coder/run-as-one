/**
 * "Forgot password?" — who may reset their own password from the sign-in page,
 * and the link that lets them (LOGIN_UX_PLAN.md Batch 2).
 *
 * **Only an account that could sign in gets a link.** The owner (Run As One's
 * own Organizer row, while `organizerOwnerCanSignIn`), and a staff member or
 * client viewer who has a password, is not suspended, and has an active
 * membership (`activeMembershipWhere`). An invited person who never chose a
 * password gets nothing — they ask for the invitation again (D4) — and so does
 * every other address. The route answers all of them identically.
 *
 * **The link works once, for 60 minutes** (D2). Only its sha256 is stored
 * (lib/secret-token.ts). A new request deletes the account's older links, so
 * only the newest email works; using one deletes the rest and keeps the used
 * row, so a second press reads "already used" rather than "unknown".
 *
 * **A reset ends every session** (`sessionsValidFrom`) and does not sign the
 * person in (D3): they go back to the sign-in page and use the new password,
 * which keeps one way in for when 2FA arrives.
 */

import type { Prisma } from '@prisma/client';
import prisma from './db';
import { activeMembershipWhere, sessionsCutoff, type AccountByEmail } from './actor';
import { recordAudit, type AuditActor } from './audit';
import { sendPasswordChangedEmail, sendPasswordResetEmail } from './email-password';
import type { EmailOutcome } from './email-document';
import { organizerOwnerCanSignIn } from './organizer-status';
import { hashSecretToken, isSecretToken, newSecretToken } from './secret-token';

/** How long a link works (D2). The email quotes it. */
export const RESET_TTL_MINUTES = 60;

export type ResetAccountKind = 'ORGANIZER' | 'STAFF';

/** An account allowed a reset: which row, and whose trail it writes into. */
export interface ResetTarget {
  kind: ResetAccountKind;
  id: string;
  email: string;
  name: string;
  who: AuditActor;
}

/**
 * The account as a reset target, or null when it may not reset its password.
 * Asked twice: when the link is requested, and again when it is used, since a
 * suspension or an archived client in the hour between must still stop it.
 */
export async function canResetPassword(account: AccountByEmail): Promise<ResetTarget | null> {
  if (account.kind === 'ORGANIZER') {
    const organizer = account.organizer;
    if (!organizerOwnerCanSignIn(organizer)) return null;
    return {
      kind: 'ORGANIZER',
      id: organizer.id,
      email: organizer.email,
      name: organizer.name,
      who: { kind: 'OWNER', id: organizer.id, orgId: organizer.id, name: organizer.name, email: organizer.email },
    };
  }

  const staff = account.staff;
  if (!staff.password || staff.status === 'SUSPENDED') return null;

  const membership = await prisma.staffMembership.findFirst({
    where: activeMembershipWhere(staff.id),
    orderBy: { acceptedAt: 'asc' },
    select: { organizerId: true },
  });
  if (!membership) return null;

  return {
    kind: 'STAFF',
    id: staff.id,
    email: staff.email,
    name: staff.name,
    who: { kind: 'STAFF', id: staff.id, orgId: membership.organizerId, name: staff.name, email: staff.email },
  };
}

/** A fresh link for this account. Every older link of theirs stops working. */
export async function newPasswordReset(target: ResetTarget, now = new Date()): Promise<string> {
  const { token, tokenHash } = newSecretToken();
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { accountKind: target.kind, accountId: target.id } }),
    prisma.passwordReset.create({
      data: {
        tokenHash,
        accountKind: target.kind,
        accountId: target.id,
        expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60_000),
      },
    }),
  ]);
  return token;
}

/**
 * What a link is now. A malformed or unknown token reads as expired: which of
 * the two it was is nothing a stranger holding a guessed URL should learn, and
 * the next step is the same.
 */
export async function findReset(token: unknown) {
  if (!isSecretToken(token)) return { state: 'expired' as const };
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashSecretToken(token) } });
  if (!reset) return { state: 'expired' as const };
  if (reset.usedAt) return { state: 'used' as const };
  if (reset.expiresAt.getTime() <= Date.now()) return { state: 'expired' as const };
  return { state: 'open' as const, reset };
}

/** The link if it is open — not used, not expired — or null. */
export async function findOpenReset(token: unknown) {
  const found = await findReset(token);
  return found.state === 'open' ? found.reset : null;
}

type OpenReset = NonNullable<Awaited<ReturnType<typeof findOpenReset>>>;

/** The account an open link belongs to, still allowed a reset, or null. */
export async function resetTargetOf(reset: OpenReset): Promise<ResetTarget | null> {
  if (reset.accountKind === 'ORGANIZER') {
    const organizer = await prisma.organizer.findUnique({ where: { id: reset.accountId } });
    return organizer ? canResetPassword({ kind: 'ORGANIZER', organizer }) : null;
  }
  const staff = await prisma.staffAccount.findUnique({ where: { id: reset.accountId } });
  return staff ? canResetPassword({ kind: 'STAFF', staff }) : null;
}

/**
 * Claims the link. Conditional on it still being open, so two presses of the
 * same link — or a press racing a newer request — cannot both set a password.
 */
export async function consumeReset(tx: Prisma.TransactionClient, id: string, now = new Date()): Promise<boolean> {
  const claim = await tx.passwordReset.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  return claim.count === 1;
}

/**
 * Sets the new password through an open link, in one transaction: claim the
 * link, write the hash, end every session, delete the account's other links,
 * and write the trail. False when the link was claimed first.
 */
export async function resetPassword({
  reset,
  target,
  passwordHash,
}: {
  reset: OpenReset;
  target: ResetTarget;
  passwordHash: string;
}): Promise<boolean> {
  const now = new Date();
  return prisma.$transaction(async tx => {
    if (!(await consumeReset(tx, reset.id, now))) return false;

    const data = { password: passwordHash, sessionsValidFrom: sessionsCutoff() };
    if (target.kind === 'ORGANIZER') {
      await tx.organizer.update({ where: { id: target.id }, data });
    } else {
      await tx.staffAccount.update({ where: { id: target.id }, data });
    }

    await tx.passwordReset.deleteMany({
      where: { accountKind: target.kind, accountId: target.id, id: { not: reset.id } },
    });

    await recordAudit(tx, target.who, {
      action: 'auth.password_reset',
      entityType: target.kind === 'ORGANIZER' ? 'Organizer' : 'StaffAccount',
      entityId: target.id,
      summary: 'Reset their password through an emailed link.',
    });
    return true;
  });
}

/**
 * Emails the link. The token arrives as an argument because the database
 * cannot give it back. Never throws, like every send in the app.
 */
export async function sendResetLink({
  target,
  token,
  origin,
}: {
  target: ResetTarget;
  token: string;
  origin: string;
}): Promise<EmailOutcome> {
  const resetUrl = `${origin}/admin/reset-password/${token}`;

  // Development only, on the developer's own console, as invitations do: a
  // laptop without email configured could never try the flow otherwise.
  // Production never prints a token.
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[auth] Password reset link for ${target.email}: ${resetUrl}`);
  }

  return sendPasswordResetEmail({
    to: target.email,
    name: target.name,
    resetUrl,
    ttlMinutes: RESET_TTL_MINUTES,
  });
}

export function sendPasswordChangedNotice(target: ResetTarget): Promise<EmailOutcome> {
  return sendPasswordChangedEmail({ to: target.email, name: target.name, changedAt: new Date() });
}
