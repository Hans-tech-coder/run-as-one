import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyPassword, createToken, setAuthCookie } from '@/lib/auth';
import { normalizeAccountEmail } from '@/lib/text-case';
import {
  activeMembershipWhere,
  findAccountByEmail,
  organizerSessionClaims,
  staffSessionClaims,
} from '@/lib/actor';
import { recordAudit, type AuditActor, type AuditEntityType } from '@/lib/audit';
import { RUN_AS_ONE_ORGANIZER_ID, organizerOwnerCanSignIn } from '@/lib/organizer-status';

/**
 * Signing in to the admin — as Run As One's own account (the owner, shown as
 * Super Admin), or as a member of its staff or a client viewer.
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
  outcome:
    | 'WRONG_PASSWORD'
    | 'SUSPENDED'
    | 'NOT_APPROVED'
    | 'NO_ACTIVE_ORGANIZER',
) {
  const summaries = {
    WRONG_PASSWORD: 'Failed sign-in: wrong password.',
    SUSPENDED: 'Sign-in refused: the account is suspended.',
    NOT_APPROVED: 'Sign-in refused: the account is not approved.',
    NO_ACTIVE_ORGANIZER: 'Sign-in refused: no active organizer to sign in to.',
  } as const;

  await recordAudit(db, who, {
    action: 'auth.sign_in_failed',
    entityType,
    entityId: who.id,
    summary: summaries[outcome],
    changes: { reason: outcome },
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

    // ── Run As One's own account, the owner ──────────────────────────────
    if (account.kind === 'ORGANIZER') {
      const organizer = account.organizer;

      // Only Run As One's row signs in as an owner (organizer-status.ts). The
      // retired super admin and the applicant rows of the self-serve days are
      // answered exactly like an address with no account — not logged, and
      // never told the address exists — because an owner session on any of
      // them would hold platform:manage over an empty tenant of its own.
      if (organizer.id !== RUN_AS_ONE_ORGANIZER_ID) {
        return INVALID();
      }

      const who: AuditActor = {
        kind: 'OWNER',
        id: organizer.id,
        orgId: organizer.id,
        name: organizer.name,
        email: organizer.email,
      };

      if (!(await verifyPassword(password, organizer.password))) {
        await logAttempt(who, 'Organizer', 'WRONG_PASSWORD');
        return INVALID();
      }

      // Still an allowlist (organizerOwnerCanSignIn): a status written by hand
      // is refused rather than let in.
      if (!organizerOwnerCanSignIn(organizer)) {
        await logAttempt(who, 'Organizer', 'NOT_APPROVED');
        return NextResponse.json(
          { error: 'This account is not active. Please contact support.' },
          { status: 403 }
        );
      }

      await db.$transaction(async tx => {
        await tx.organizer.update({
          where: { id: organizer.id },
          data: { lastLoginAt: new Date() },
        });
        await recordAudit(tx, who, {
          action: 'auth.signed_in',
          entityType: 'Organizer',
          entityId: organizer.id,
          summary: 'Signed in.',
        });
      });

      const token = await createToken(organizerSessionClaims(organizer));
      await setAuthCookie(token);

      return NextResponse.json({ success: true, role: 'OWNER' }, { status: 200 });
    }

    // ── A member of an organizer's staff ─────────────────────────────────
    const staff = account.staff;

    // The organizer this sign-in lands in: the earliest membership that is
    // accepted, not suspended, and inside an active organizer. Run As One is
    // the one tenant (ADMIN_MERGE_PLAN.md), so there is no switching once
    // signed in; a membership elsewhere being suspended still does not stop
    // this one.
    const membership = await db.staffMembership.findFirst({
      where: activeMembershipWhere(staff.id),
      orderBy: { acceptedAt: 'asc' },
      select: { organizerId: true, role: true },
    });

    // A refused attempt still needs an organizer's trail to be written into,
    // even when none of this person's memberships is usable any more — a run
    // of wrong passwords against a suspended validator is exactly what an
    // owner reviewing an incident wants to see.
    const acceptedMembership = membership
      ? null
      : await db.staffMembership.findFirst({
          where: { staffId: staff.id, acceptedAt: { not: null } },
          orderBy: { acceptedAt: 'asc' },
          select: { organizerId: true, role: true },
        });
    const trailOrganizerId = membership?.organizerId ?? acceptedMembership?.organizerId;

    const who: AuditActor | null = trailOrganizerId
      ? {
          kind: 'STAFF',
          id: staff.id,
          orgId: trailOrganizerId,
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

    if (!membership || !who) {
      if (who) await logAttempt(who, 'StaffAccount', 'NO_ACTIVE_ORGANIZER');
      // A client's own sign-in whose client was archived (ADMIN_MERGE_PLAN.md,
      // Batch 4). It has no organizer it works for, so the team's sentence
      // would send it to ask somebody who does not exist.
      const error =
        acceptedMembership?.role === 'VIEWER'
          ? "Your organization's sign-in is not active right now. Please contact Run As One."
          : 'Your account is not part of an active organizer. Please contact the organizer you work with.';
      return NextResponse.json({ error }, { status: 403 });
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
