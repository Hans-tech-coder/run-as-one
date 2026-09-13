/**
 * Who is signed into the admin, as the sidebars need to show them.
 *
 * Both the organizer sidebar and the superadmin sidebar put a name and an
 * avatar initial above the logout button, so they read the signed-in account
 * from here instead of each hardcoding a placeholder.
 *
 * The auth cookie already carries a name, but it only carries the one the
 * token was issued with: a rename — by the organizer themselves, or by the
 * superadmin from the organizers screen — would leave the sidebar showing a
 * stale name until the next sign-in. The record is the truth, so this reads
 * it and keeps the token's name only as a fallback.
 *
 * It names the **person**, not the organizer: a staff member's sidebar says
 * their own name, which getActor() has already read from their StaffAccount.
 */

import prisma from './db';
import { getActor } from './actor';

export type SignedInUser = {
  name: string;
  /** First letter of the name, for the round avatar. */
  initial: string;
};

export async function getSignedInUser(): Promise<SignedInUser | null> {
  const actor = await getActor();
  if (!actor) return null;

  let name = actor.name;
  if (actor.kind !== 'STAFF') {
    const organizer = await prisma.organizer.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    name = organizer?.name ?? actor.name;
  }

  name = name.trim();
  if (!name) return null;

  return { name, initial: name.charAt(0).toUpperCase() };
}
