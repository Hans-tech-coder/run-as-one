/**
 * The secret in an emailed link — an invitation (lib/team-invite.ts) or a
 * password reset (lib/password-reset.ts).
 *
 * **The token is only ever in the link.** What the database keeps is its
 * sha256, so a read of the table — a backup, a support query, a leaked branch —
 * hands nobody a way in. sha256 rather than bcrypt because the token is 256
 * random bits: there is nothing to slow a guesser down *on*, and the lookup has
 * to find the row by the hash.
 */

import { createHash, randomBytes } from 'node:crypto';

/** base64url of 32 bytes is 43 characters; anything else is not one of ours. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isSecretToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A fresh 256-bit token and the hash to store for it. */
export function newSecretToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSecretToken(token) };
}
