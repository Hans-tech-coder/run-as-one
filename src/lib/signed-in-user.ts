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
 */

import prisma from './db';
import { getAuthCookie } from './auth';

export type SignedInUser = {
  name: string;
  /** First letter of the name, for the round avatar. */
  initial: string;
};

export async function getSignedInUser(): Promise<SignedInUser | null> {
  const auth = await getAuthCookie();
  if (!auth?.id) return null;

  const organizer = await prisma.organizer.findUnique({
    where: { id: String(auth.id) },
    select: { name: true },
  });

  const tokenName = typeof auth.name === 'string' ? auth.name : '';
  const name = (organizer?.name ?? tokenName).trim();
  if (!name) return null;

  return { name, initial: name.charAt(0).toUpperCase() };
}
