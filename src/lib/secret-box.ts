/**
 * The one reversible secret in the app: a secret the server must read back,
 * which today means a TOTP secret (lib/two-factor.ts, TWO_FACTOR_PLAN.md).
 *
 * **What is stored can be read back only with `TOTP_ENCRYPTION_KEY`.** A hash
 * will not do here (lib/secret-token.ts hashes, bcrypt hashes) because checking
 * a 6-digit code needs the secret itself. So the column holds AES-256-GCM
 * ciphertext, and a read of the table — a backup, a support query, a leaked
 * branch — hands nobody an authenticator.
 *
 * - Sealed as `v1.<iv>.<tag>.<ciphertext>`, each part base64url, with a fresh
 *   random 12-byte IV per seal. GCM's tag means a changed byte fails to open
 *   rather than opening to something else.
 * - The key is 32 bytes, base64, read **when called**, not at import: a deploy
 *   without it still builds and serves everything but two-step sign-in.
 * - **Losing the key makes every sealed secret unreadable** — everyone enrolled
 *   would have to enrol again. Keep it in the password manager, not only in
 *   Vercel.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function key(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TOTP_ENCRYPTION_KEY is not set. Generate one with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"` ' +
        'and add it to .env (and to Vercel for Production and Preview).',
    );
  }
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  }
  return bytes;
}

/**
 * Whether a usable key is set — so Settings can leave two-step sign-in out
 * rather than offer a button that fails.
 */
export function sealingConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
}

/** Throws on anything that is not a seal made with this key, untouched. */
export function openSecret(sealed: string): string {
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Not a sealed secret.');
  }
  const [iv, tag, ciphertext] = parts.slice(1).map((part) => Buffer.from(part, 'base64url'));
  // A short tag would still "authenticate"; only the full 16 bytes are ours.
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Not a sealed secret.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
