import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyPassword, createToken, setAuthCookie } from '@/lib/auth';
import { normalizeAccountEmail } from '@/lib/text-case';
import {
  findAccountByEmail,
  isBlockedOrganizerStatus,
  organizerSessionClaims,
  staffSessionClaims,
} from '@/lib/actor';
import { recordAudit, type AuditActor, type AuditEntityType } from '@/lib/audit';

/**
 * Signing in to the admin — as an organizer's owner, as the super admin, or as
 * a member of an organizer's staff.
 *
 * The address is looked up through `findAccountByEmail`, the one helper the
 * register and profile routes use too, so the Organizer and StaffAccount
 * tables can never disagree about who an address belongs to.
 *
 * **Sign-ins and failed sign-ins go in the trail** (STAFF_ACCESS_PLAN.md §4.3)
 * — a run of wrong passwords against a validator's account is exactly what an
 * incident review asks about. An address that matches no account is not
 * logged: a row needs an organizer to belong to, and a stranger typing
 * addresses has none.
 */

const INVALID = () => NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

async function logAttempt(
  who: AuditActor,
  entityType: AuditEntityType,
  outcome: 'SIGNED_IN' | 'WRONG_PASSWORD' | 'PENDING_APPROVAL' | 'SUSPENDED' | 'NO_ACTIVE_ORGANIZER',
) {
  const summaries = {
    SIGNED_IN: 'Signed in.',
    WRONG_PASSWORD: 'Failed sign-in: wrong password.',
    PENDING_APPROVAL: 'Sign-in refused: the account is still pending approval.',
    SUSPENDED: 'Sign-in refused: the account is suspended.',
    NO_ACTIVE_ORGANIZER: 'Sign-in refused: no active organizer to sign in to.',
  } as const;

  await recordAudit(db, who, {
    action: outcome === 'SIGNED_IN' ? 'auth.signed_in' : 'auth.sign_in_failed',
    entityType,
    entityId: who.id,
    summary: summaries[outcome],
    changes: outcome === 'SIGNED_IN' ? null : { reason: outcome },
  });
}

export async function POST(request: Request) {
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

    const account = await findAccountByEmail(signInEmail);

    if (!account) {
      return INVALID();
    }

    // ── An organizer's owner, or the super admin ─────────────────────────
    if (account.kind === 'ORGANIZER') {
      const organizer = account.organizer;
      const who: AuditActor = {
        kind: organizer.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OWNER',
        id: organizer.id,
        orgId: organizer.id,
        name: organizer.name,
        email: organizer.email,
      };

      if (!(await verifyPassword(password, organizer.password))) {
        await logAttempt(who, 'Organizer', 'WRONG_PASSWORD');
        return INVALID();
      }

      if (organizer.role !== 'SUPER_ADMIN') {
        if (organizer.status === 'PENDING') {
          await logAttempt(who, 'Organizer', 'PENDING_APPROVAL');
          return NextResponse.json(
            { error: 'Your account is pending approval by the Super Admin.' },
            { status: 403 }
          );
        }

        if (organizer.status === 'SUSPENDED') {
          await logAttempt(who, 'Organizer', 'SUSPENDED');
          return NextResponse.json(
            { error: 'Your account is suspended. Please contact support.' },
            { status: 403 }
          );
        }
      }

      await logAttempt(who, 'Organizer', 'SIGNED_IN');

      // Account is approved, issue token
      const token = await createToken(organizerSessionClaims(organizer));
      await setAuthCookie(token);

      return NextResponse.json({ success: true, role: organizer.role }, { status: 200 });
    }

    // ── A member of an organizer's staff ─────────────────────────────────
    const staff = account.staff;

    // The organizer this sign-in lands in. A person may work for several; until
    // the team screen gives them a way to switch, it is the first organizer
    // that accepted them and is still active.
    const membership = await db.staffMembership.findFirst({
      where: { staffId: staff.id, acceptedAt: { not: null } },
      orderBy: { acceptedAt: 'asc' },
      select: { organizerId: true, role: true, organizer: { select: { status: true } } },
    });

    const who: AuditActor | null = membership
      ? {
          kind: 'STAFF',
          id: staff.id,
          orgId: membership.organizerId,
          name: staff.name,
          email: staff.email,
        }
      : null;

    // An invitation not yet accepted has no password, and is answered exactly
    // like a wrong one: the address existing is not something to confirm.
    if (!staff.password || !(await verifyPassword(password, staff.password))) {
      if (who) await logAttempt(who, 'StaffAccount', 'WRONG_PASSWORD');
      return INVALID();
    }

    if (staff.status === 'SUSPENDED') {
      if (who) await logAttempt(who, 'StaffAccount', 'SUSPENDED');
      return NextResponse.json(
        { error: 'Your account is suspended. Please contact the organizer you work with.' },
        { status: 403 }
      );
    }

    if (!membership || !who || isBlockedOrganizerStatus(membership.organizer.status)) {
      if (who) await logAttempt(who, 'StaffAccount', 'NO_ACTIVE_ORGANIZER');
      return NextResponse.json(
        { error: 'Your account is not part of an active organizer. Please contact the organizer you work with.' },
        { status: 403 }
      );
    }

    await db.$transaction(async tx => {
      await tx.staffAccount.update({
        where: { id: staff.id },
        data: { lastLoginAt: new Date() },
      });
      await recordAudit(tx, who, {
        action: 'auth.signed_in',
        entityType: 'StaffAccount',
        entityId: staff.id,
        summary: 'Signed in.',
      });
    });

    const token = await createToken(staffSessionClaims(staff, membership));
    await setAuthCookie(token);

    return NextResponse.json({ success: true, role: 'STAFF' }, { status: 200 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Something went wrong during login' },
      { status: 500 }
    );
  }
}
