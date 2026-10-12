/**
 * Who has two-step sign-in on, and how a second-step code is checked
 * (TWO_FACTOR_PLAN.md). The owner's Organizer row and a StaffAccount carry the
 * same four columns and follow the same rules here.
 *
 * - **On means a secret set and confirmed** (`twoFactorOn`). A secret with no
 *   `totpConfirmedAt` is an enrolment never finished, and does not count.
 * - **A second step is a TOTP code or a recovery code** (`checkSecondStep`),
 *   each good once. Spending one is a conditional update on what was read, so
 *   two tabs sending the same code cannot both get in: the second update
 *   matches no row.
 * - **Recovery codes** (D3): ten, `xxxx-xxxx` from lowercase letters and digits
 *   without look-alikes (no 0/o, 1/l/i), shown once and stored only as bcrypt
 *   hashes. A code is checked without its dash, in any case.
 * - **Turning it off clears all four columns** (`TWO_FACTOR_OFF`), whoever does
 *   it, so an old secret can never come back to life by a later confirm.
 * - **An admin may reset somebody else's** (`resetTwoFactor`, D4) — a staff
 *   member or a client viewer, never the owner, whose Organizer row has nobody
 *   above it (ON_HOLD.md keeps the hand-run step).
 */

import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import type { Prisma, StaffAccount } from '@prisma/client';
import db from './db';
import { sessionsCutoff, type AccountByEmail, type Actor } from './actor';
import { recordAudit } from './audit';
import { openSecret } from './secret-box';
import { verifyTotp } from './totp';

export type TwoFactorFields = Pick<
  StaffAccount,
  'totpSecret' | 'totpConfirmedAt' | 'recoveryCodes' | 'totpLastStep'
>;

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/** The cost `hashPassword` uses (lib/auth.ts). */
const BCRYPT_COST = 10;

export function twoFactorOn(account: Pick<TwoFactorFields, 'totpSecret' | 'totpConfirmedAt'>): boolean {
  return Boolean(account.totpSecret && account.totpConfirmedAt);
}

function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, '');
}

/** Ten fresh codes: `codes` to show once, `hashes` to store. */
export async function newRecoveryCodes(): Promise<{ codes: string[]; hashes: string[] }> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 8 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]);
    return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
  });
  const hashes = await Promise.all(codes.map((code) => bcrypt.hash(normalizeRecoveryCode(code), BCRYPT_COST)));
  return { codes, hashes };
}

/** The hashes left once `code` is spent, or null when it matches none. */
export async function spendRecoveryCode(hashes: string[], code: string): Promise<string[] | null> {
  const typed = normalizeRecoveryCode(code);
  if (!/^[a-z0-9]{8}$/.test(typed)) return null;
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(typed, hashes[i])) {
      return hashes.filter((_, index) => index !== i);
    }
  }
  return null;
}

/** What turning two-step sign-in off writes, for every way it is turned off. */
export const TWO_FACTOR_OFF = {
  totpSecret: null,
  totpConfirmedAt: null,
  recoveryCodes: [],
  totpLastStep: null,
} satisfies TwoFactorFields;

export function fieldsOf(account: AccountByEmail): TwoFactorFields & { id: string } {
  return account.kind === 'ORGANIZER' ? account.organizer : account.staff;
}

/**
 * The signed-in person's own row, in the shape sign-in reads it: the owner's
 * Organizer row or the person's StaffAccount, never someone else's.
 */
export async function ownAccount(actor: Pick<Actor, 'kind' | 'id'>): Promise<AccountByEmail | null> {
  if (actor.kind === 'OWNER') {
    const organizer = await db.organizer.findUnique({ where: { id: actor.id } });
    return organizer ? { kind: 'ORGANIZER', organizer } : null;
  }
  const staff = await db.staffAccount.findUnique({ where: { id: actor.id } });
  return staff ? { kind: 'STAFF', staff } : null;
}

/** The audit trail's name for the account's table. */
export function accountEntityType(account: AccountByEmail): 'Organizer' | 'StaffAccount' {
  return account.kind === 'ORGANIZER' ? 'Organizer' : 'StaffAccount';
}

/** Writes two-step columns (and, when it ends sessions, `sessionsValidFrom`) on either table. */
export async function writeAccount(
  client: Pick<Prisma.TransactionClient, 'organizer' | 'staffAccount'>,
  account: AccountByEmail,
  data: Partial<TwoFactorFields> & { sessionsValidFrom?: Date },
): Promise<void> {
  const { id } = fieldsOf(account);
  if (account.kind === 'ORGANIZER') {
    await client.organizer.update({ where: { id }, data });
  } else {
    await client.staffAccount.update({ where: { id }, data });
  }
}

/**
 * An admin clearing another person's two-step sign-in, for a lost phone with
 * no recovery codes left (D4). Who may do it is the calling route's question;
 * what it does is the same from the Team page and from a client's sign-ins:
 * the four columns cleared, **every session of theirs ended** — whoever holds
 * the phone or a stolen cookie is signed out with the protection — and a trail
 * row on their account naming the admin.
 *
 * Conditional on it still being on, so two admins pressing at once write one
 * row; false when there was nothing to reset.
 */
export async function resetTwoFactor(
  actor: Actor,
  staff: { id: string; name: string; email: string },
): Promise<boolean> {
  return db.$transaction(async tx => {
    const { count } = await tx.staffAccount.updateMany({
      where: { id: staff.id, totpSecret: { not: null }, totpConfirmedAt: { not: null } },
      data: { ...TWO_FACTOR_OFF, sessionsValidFrom: sessionsCutoff() },
    });
    if (count === 0) return false;
    await recordAudit(tx, actor, {
      action: 'auth.two_factor_reset',
      entityType: 'StaffAccount',
      entityId: staff.id,
      summary: `Reset two-step sign-in for ${staff.name} (${staff.email}). They sign in with their password alone until they turn it on again.`,
    });
    return true;
  });
}

/** What the row must still hold for a code to be spent. */
type SpendGuard = {
  totpSecret: string;
  OR?: { totpLastStep: null | { lt: number } }[];
  recoveryCodes?: { equals: string[] };
};

/**
 * Writes `data` only while the row still holds what was read (`where`), and
 * says whether it did.
 */
async function updateIfUnchanged(
  account: AccountByEmail,
  where: SpendGuard,
  data: Partial<TwoFactorFields>,
): Promise<boolean> {
  const { id } = fieldsOf(account);
  const result =
    account.kind === 'ORGANIZER'
      ? await db.organizer.updateMany({ where: { id, ...where }, data })
      : await db.staffAccount.updateMany({ where: { id, ...where }, data });
  return result.count === 1;
}

/**
 * Checks a second step for an account that has two-step sign-in on, and spends
 * it: the TOTP step is recorded so the code cannot be used again, or the
 * recovery code is struck from the list. Null for a wrong, reused or spent
 * code, and for an account with it off.
 */
export async function checkSecondStep(
  account: AccountByEmail,
  code: string,
): Promise<'totp' | 'recovery' | null> {
  const fields = fieldsOf(account);
  if (!twoFactorOn(fields) || typeof code !== 'string') return null;
  const secret = fields.totpSecret as string;

  if (/^\d{6}$/.test(code.replace(/\s/g, ''))) {
    const step = verifyTotp(openSecret(secret), code, fields.totpLastStep);
    if (step === null) return null;
    const spent = await updateIfUnchanged(
      account,
      { totpSecret: secret, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      { totpLastStep: step },
    );
    return spent ? 'totp' : null;
  }

  const remaining = await spendRecoveryCode(fields.recoveryCodes, code);
  if (!remaining) return null;
  const spent = await updateIfUnchanged(
    account,
    { totpSecret: secret, recoveryCodes: { equals: fields.recoveryCodes } },
    { recoveryCodes: remaining },
  );
  return spent ? 'recovery' : null;
}
