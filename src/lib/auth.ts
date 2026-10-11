import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { createToken, verifyToken } from './jwt';

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

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 1 day
    path: '/',
  });
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
