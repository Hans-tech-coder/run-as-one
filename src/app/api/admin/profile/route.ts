import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import {
  findAccountByEmail,
  getActor,
  organizerSessionClaims,
  staffSessionClaims,
} from '@/lib/actor';
import { changedFields, listFields, recordAudit } from '@/lib/audit';
import { normalizeAccountEmail } from '@/lib/text-case';

/**
 * The signed-in person editing their own name and email.
 *
 * The id comes from the session and never from the body: a person may only
 * ever edit themselves, so there is no id to pass and no id to forge.
 * Changing an account someone else owns is the super admin's screen, not this.
 *
 * "Themselves" is the person, not the organizer: an owner edits the Organizer
 * row they sign in with, a staff member edits their own StaffAccount. Neither
 * can rename the other through this route.
 */
export async function PATCH(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    // Lower-cased, and it has to be. This used to be trimmed only, reasoning
    // that login matched the stored address exactly and folding the case would
    // lock out anyone who had registered with a capital. That was true right up
    // until login started lowercasing its lookup -- which inverts it: a capital
    // saved here would now produce a row login can never find, and the organizer
    // would be locked out by the screen they used to update their own profile.
    // One helper on all three routes is what keeps them from disagreeing again.
    const email = normalizeAccountEmail(body.email);

    // Keyed by field so the form can put each message under the input it is
    // about, rather than showing one catch-all line above the whole form.
    const errors: Record<string, string> = {};

    if (!name) {
      errors.name = 'Enter the name your runners should see';
    } else if (name.length > 100) {
      errors.name = 'Keep the name to 100 characters or fewer';
    }

    if (!email) {
      errors.email = 'Enter the email address you sign in with';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address, like you@example.com';
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const isStaff = actor.kind === 'STAFF';

    // Checked before the write so the person gets this message under the
    // email field; the unique index below is the backstop for the race. Both
    // account tables are searched, so an address cannot end up signing in to
    // two different accounts.
    const taken = await findAccountByEmail(email);
    const takenBySomeoneElse =
      taken !== null &&
      !(taken.kind === 'ORGANIZER' && !isStaff && taken.organizer.id === actor.id) &&
      !(taken.kind === 'STAFF' && isStaff && taken.staff.id === actor.id);
    const takenMessage =
      taken?.kind === 'STAFF'
        ? 'Another account already signs in with that email'
        : 'Another organizer already signs in with that email';

    if (takenBySomeoneElse) {
      return NextResponse.json({ errors: { email: takenMessage } }, { status: 409 });
    }

    let account: { id: string; name: string; email: string; role?: string };
    try {
      account = await prisma.$transaction(async tx => {
        const before = isStaff
          ? await tx.staffAccount.findUniqueOrThrow({ where: { id: actor.id } })
          : await tx.organizer.findUniqueOrThrow({ where: { id: actor.id } });

        const after = isStaff
          ? await tx.staffAccount.update({ where: { id: actor.id }, data: { name, email } })
          : await tx.organizer.update({ where: { id: actor.id }, data: { name, email } });

        const changes = changedFields(before, after, ['name', 'email']);
        if (Object.keys(changes).length > 0) {
          await recordAudit(tx, actor, {
            action: 'profile.updated',
            entityType: isStaff ? 'StaffAccount' : 'Organizer',
            entityId: actor.id,
            summary: `Updated their profile: ${listFields(Object.keys(changes))}.`,
            changes,
          });
        }

        return after;
      });
    } catch (error: unknown) {
      // P2002 is Prisma's unique-constraint violation: someone claimed the
      // address between the check above and this write.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        return NextResponse.json({ errors: { email: takenMessage } }, { status: 409 });
      }
      throw error;
    }

    // The token carries the name and email, so a stale one would keep showing
    // the old details until it expired a day later. Reissue it here.
    const token = await createToken(
      isStaff
        ? staffSessionClaims(account, { organizerId: actor.orgId, role: actor.role })
        : organizerSessionClaims({ ...account, role: account.role ?? 'ORGANIZER' }),
    );
    await setAuthCookie(token);

    return NextResponse.json({
      success: true,
      organizer: { id: account.id, name: account.name, email: account.email },
    });
  } catch (error) {
    console.error('Failed to update organizer profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
