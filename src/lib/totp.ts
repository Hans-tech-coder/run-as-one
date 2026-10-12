/**
 * The 6-digit code from an authenticator app (RFC 6238 TOTP, RFC 4226 HOTP),
 * written on Node's crypto rather than a package (TWO_FACTOR_PLAN.md D8).
 *
 * **A code is accepted once, within a minute and a half, and never again.**
 * - HMAC-SHA1, 30-second steps, 6 digits: what every authenticator app does by
 *   default, and what `totpUri` tells it.
 * - The current step and one either side are tried, so a phone clock up to
 *   30 seconds off still works; a code two steps old is refused.
 * - A step at or below the last one accepted (`totpLastStep`, stored by
 *   lib/two-factor.ts) is refused, so a code read over a shoulder cannot be
 *   used a second time in its window.
 * - Codes are compared in constant time.
 *
 * The secret is base32 here, as the app types it; it is sealed before it is
 * stored (lib/secret-box.ts).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const ISSUER = 'Run As One';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Not a base32 secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh secret: 20 random bytes (160 bits, RFC 4226's size), base32. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** What the QR code holds; the app shows "Run As One (email)". */
export function totpUri({ secret, email }: { secret: string; email: string }): string {
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&digits=${DIGITS}&period=${STEP_SECONDS}&algorithm=SHA1`;
}

/** RFC 4226's code for one counter, as `digits` characters. */
export function hotp(key: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/**
 * The step the code belongs to, or null. `lastStep` is the step of the last
 * code this account had accepted (null when none): it and every earlier step
 * are refused.
 */
export function verifyTotp(
  secret: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
): number | null {
  const typed = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) return null;
  const key = base32Decode(secret);
  const current = totpStep(now);
  let accepted: number | null = null;
  // Every candidate is computed and compared, so the time taken does not say
  // which window matched.
  for (const step of [current - 1, current, current + 1]) {
    const match = timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(typed));
    if (match && (lastStep === null || step > lastStep)) accepted = step;
  }
  return accepted;
}
