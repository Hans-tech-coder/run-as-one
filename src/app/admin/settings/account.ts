import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import type { Actor } from '@/lib/actor';

/**
 * The signed-in person's own record, for the settings pages. For an owner
 * "the person" is the Organizer row; for a staff member (and a client viewer)
 * it is their own StaffAccount, never the organizer they work for. It is read
 * fresh rather than taken from the token, because the token is up to a day old
 * and the details may have changed since.
 *
 * The Organizer row has no phone column; its phone is always null.
 *
 * A valid cookie whose account is gone — a deleted organizer holding a token
 * that has not expired yet — is sent back to the sign-in screen rather than
 * shown a form with nothing behind it.
 */
export async function loadOwnAccount(actor: Actor) {
  const account =
    actor.kind === 'STAFF'
      ? await prisma.staffAccount.findUnique({
          where: { id: actor.id },
          select: { name: true, email: true, phone: true, avatarUrl: true, lastLoginAt: true },
        })
      : await prisma.organizer
          .findUnique({
            where: { id: actor.id },
            select: { name: true, email: true, avatarUrl: true, lastLoginAt: true },
          })
          .then(row => (row ? { ...row, phone: null } : null));

  if (!account) redirect('/admin/login');
  return account;
}
