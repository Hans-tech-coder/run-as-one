import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { RUN_AS_ONE_ORGANIZER_ID } from './organizer-status';

const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error(
    'JWT_SECRET is not set. Generate one with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"` ' +
      'and add it to .env (local) or the Vercel project settings (deployed).'
  );
}

const SECRET_KEY = new TextEncoder().encode(secret);

/**
 * Whose session this is.
 *
 * - OWNER — an Organizer row signing in with its own email and password.
 * - STAFF — a StaffAccount, acting inside one organizer it holds a membership in.
 *
 * There was a third, SUPER_ADMIN, until ADMIN_MERGE_PLAN.md Batch 5 retired
 * the super admin account. A token still carrying it is refused outright, and
 * so is an OWNER token for any Organizer row but Run As One's — the only owner
 * (organizer-status.ts) — so `proxy.ts` turns one away before a page renders.
 */
export type SessionKind = 'OWNER' | 'STAFF';

/**
 * What the admin session cookie carries. Typed, because "authorisation scopes
 * by orgId, attribution records the person" (STAFF_ACCESS_PLAN.md §1.1) only
 * holds if nothing downstream has to guess which of the two an `id` meant.
 *
 * For an owner `sub === orgId`, which is why rewiring every admin route from
 * the organizer id to `orgId` changes nothing until staff exist.
 */
export type SessionClaims = {
  /** The person: an Organizer id, or a StaffAccount id for STAFF. */
  sub: string;
  kind: SessionKind;
  /** The tenant this session acts inside — always an Organizer id. */
  orgId: string;
  /** OWNER, or the membership's ADMIN / STAFF / VIEWER. */
  role: string;
  name: string;
  email: string;
};

export type VerifiedSession = SessionClaims & {
  /** When the token was issued, in seconds. A staff session issued before the
   *  account's `sessionsValidFrom` is refused — see lib/actor.ts. */
  iat: number | null;
};

export async function createToken(claims: SessionClaims): Promise<string> {
  const { sub, ...rest } = claims;
  return await new SignJWT(rest)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(SECRET_KEY);
}

export async function verifyToken(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return readClaims(payload);
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readClaims(payload: JWTPayload): VerifiedSession | null {
  const iat = typeof payload.iat === 'number' ? payload.iat : null;

  // A token issued before staff accounts existed: `{ id, email, name, role }`
  // with no kind. Such a token lives for a day, so the deploy that introduces
  // the new claims would otherwise sign out every organizer mid-shift. It can
  // only ever have been an Organizer row, so it reads as that row's owner.
  if (payload.kind === undefined) {
    const id = text(payload.id);
    if (id !== RUN_AS_ONE_ORGANIZER_ID || payload.role === 'SUPER_ADMIN') return null;
    return {
      sub: id,
      kind: 'OWNER',
      orgId: id,
      role: 'OWNER',
      name: text(payload.name),
      email: text(payload.email),
      iat,
    };
  }

  const kind = payload.kind;
  if (kind !== 'OWNER' && kind !== 'STAFF') return null;

  const sub = text(payload.sub);
  const orgId = text(payload.orgId);
  if (!sub || !orgId) return null;
  if (kind === 'OWNER' && sub !== RUN_AS_ONE_ORGANIZER_ID) return null;

  return {
    sub,
    kind,
    orgId,
    role: text(payload.role),
    name: text(payload.name),
    email: text(payload.email),
    iat,
  };
}
