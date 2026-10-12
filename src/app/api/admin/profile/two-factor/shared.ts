import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { AccountByEmail, Actor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { allowRequest, TWO_FACTOR_RULE } from '@/lib/rate-limit';
import { accountEntityType } from '@/lib/two-factor';

/**
 * What the Settings › Security two-step routes share (TWO_FACTOR_PLAN.md
 * Batch 2): the per-account throttle on every route that takes a code, and the
 * trail row for a wrong one. Not a route itself — Next serves only `route.ts`.
 */

/** Counts this try against the account; false once it is over TWO_FACTOR_RULE. */
export function allowCodeTry(actor: Actor): boolean {
  return allowRequest('two-factor', `${actor.kind}:${actor.id}`, TWO_FACTOR_RULE);
}

export function tooManyTries() {
  return NextResponse.json(
    { error: 'Too many codes in a few minutes. Wait five minutes, then try again.' },
    { status: 429 },
  );
}

/** A wrong code is written down, so a run of them shows on the activity screen. */
export async function recordWrongCode(actor: Actor, account: AccountByEmail, where: string) {
  await recordAudit(prisma, actor, {
    action: 'auth.two_factor_failed',
    entityType: accountEntityType(account),
    entityId: actor.id,
    summary: `Entered a wrong two-step code (${where}).`,
  });
}

/** The sentence under the code box wherever an authenticator code is refused. */
export const WRONG_CODE =
  'That code did not work. Use the newest code in your authenticator app, and check that your phone sets its time automatically.';

/** The same, where a recovery code is also accepted. */
export const WRONG_CODE_OR_RECOVERY =
  'That code did not work. Use the newest code in your authenticator app (check that your phone sets its time automatically), or one of your unused recovery codes.';

/** The code box's value with spaces taken out; '' when it is not text. */
export function typedCode(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s/g, '') : '';
}
