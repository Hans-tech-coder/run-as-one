import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { SESSION_SECONDS, createToken, verifyToken, type SessionClaims, type SessionLength } from './jwt';

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * A bcrypt hash of a random string nobody kept, at the same cost as
 * `hashPassword`. Comparing against it costs exactly what a real check costs
 * and can never succeed.
 */
const DUMMY_PASSWORD_HASH = '$2b$10$Tjx8kVSm5hAhOODEgRXfDem8KnSW2II1fYxzQ.OiYMapn5MLu4/1C';

/**
 * Spend a real password check's time on a sign-in that has no password to
 * check — no account, an Organizer row that is not Run As One's, or an
 * invitation not yet accepted. Without it those answered "Invalid credentials"
 * in a few milliseconds and a wrong password in ~100, so the clock told a
 * stranger which addresses have an account.
 */
export async function verifyNoPassword(password: string): Promise<false> {
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  return false;
}

// Re-export for compatibility
export { createToken, verifyToken };

/** `length` must match the token's: a day, or 30 days kept (SESSION_SECONDS). */
export async function setAuthCookie(token: string, length: SessionLength = 'day') {
  const cookieStore = await cookies();
  cookieStore.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_SECONDS[length],
    path: '/',
  });
}

/**
 * Reissue the signed-in person's own cookie with fresh claims (a new name or
 * email, or after ending their other sessions), keeping the length they chose
 * at sign-in — a kept session is not cut to a day by a profile edit.
 */
export async function reissueAuthCookie(claims: SessionClaims) {
  const length = (await getAuthCookie())?.length ?? 'day';
  await setAuthCookie(await createToken(claims, length), length);
}

/**
 * The raw session claims, or null. **Admin surfaces do not call this** — they
 * call `getActor()` / `requireActor()` in lib/actor.ts, which also checks a
 * staff session against the record and knows which events it may reach.
 */
export async function getAuthCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_token');
}
