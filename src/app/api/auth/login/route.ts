import { NextResponse } from 'next/server';
import { verifyPassword, verifyNoPassword } from '@/lib/auth';
import { normalizeAccountEmail } from '@/lib/text-case';
import { findAccountByEmail } from '@/lib/actor';
import { completeSignIn, logSignInFailure, signInSubject } from '@/lib/sign-in';
import { SIGN_IN_ERRORS } from '@/lib/sign-in-errors';
import { LOGIN_ACCOUNT_RULE, LOGIN_RULE, allowRequest, callerKey } from '@/lib/rate-limit';

/**
 * Signing in to the admin with a password — as Run As One's own account (the
 * owner, shown as Super Admin), or as a member of its staff or a client viewer.
 *
 * This route checks the password and nothing else. Who may sign in once it is
 * right — the owner's allowlist, suspension, an active membership — and the
 * trail rows, `lastLoginAt` and the cookie live in `completeSignIn`
 * (lib/sign-in.ts), which Google sign-in calls too.
 *
 * The address is looked up through `findAccountByEmail`, the one helper the
 * register and profile routes use too, so the Organizer and StaffAccount
 * tables can never disagree about who an address belongs to.
 *
 * **Failed sign-ins go in the trail** (STAFF_ACCESS_PLAN.md §4.3) — a run of
 * wrong passwords against a validator's account is exactly what an incident
 * review asks about. An address that matches no account is not logged: a row
 * needs an organizer to belong to, and a stranger typing addresses has none.
 *
 * **Throttled twice** (lib/rate-limit.ts): per address before the body is
 * read, and per account email once it is. **Equal timing:** every
 * "Invalid credentials" costs one bcrypt compare, against a dummy hash when
 * there is no password to check (`verifyNoPassword`), so a known address and
 * an unknown one take the same time.
 */

const INVALID = () => NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

// Said plainly — the sign-in page shows `error` as it stands. The same
// sentence for both buckets, so it does not say whether the address exists.
const THROTTLED = () =>
  NextResponse.json({ error: SIGN_IN_ERRORS.throttled }, { status: 429 });

export async function POST(request: Request) {
  if (!allowRequest('login', callerKey(request), LOGIN_RULE)) {
    return THROTTLED();
  }

  try {
    const { email, password } = await request.json();

    // Lowercased before the lookup, never as typed: Postgres compares text
    // exactly, so one capital from a browser autofill used to find no row and
    // answer "Invalid credentials" for a password that was perfectly correct.
    // See normalizeAccountEmail in lib/text-case.ts for why this address is the
    // one email in the app that gets cased.
    const signInEmail = normalizeAccountEmail(email);

    if (!signInEmail || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (!allowRequest('login-account', signInEmail, LOGIN_ACCOUNT_RULE)) {
      return THROTTLED();
    }

    const account = await findAccountByEmail(signInEmail);
    // Null too for an Organizer row that is not Run As One's (signInSubject).
    const subject = account ? await signInSubject(account) : null;

    if (!subject) {
      await verifyNoPassword(password);
      return INVALID();
    }

    // An invitation not yet accepted has no password, and is answered exactly
    // like a wrong one: the address existing is not something to confirm.
    const hash = subject.kind === 'ORGANIZER' ? subject.organizer.password : subject.staff.password;
    const passwordOk = hash
      ? await verifyPassword(password, hash)
      : await verifyNoPassword(password);
    if (!passwordOk) {
      await logSignInFailure(subject, 'WRONG_PASSWORD', 'password');
      return INVALID();
    }

    const result = await completeSignIn(subject, { method: 'password' });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, role: result.role }, { status: 200 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Something went wrong during login' },
      { status: 500 }
    );
  }
}
