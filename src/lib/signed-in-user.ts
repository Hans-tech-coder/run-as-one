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
 * their own name, which getActor() has already read from their StaffAccount,
 * with the organizer they are working inside underneath it.
 *
 * It also decides which sidebar items this person has any reason to open, so
 * a validator is never offered a Marketing screen that would only 404 on them.
 * The pages still check for themselves; hiding a link is manners, not access.
 */

import prisma from './db';
import { activeMembershipWhere, can, canSomewhere, getActor } from './actor';
import { ROLE_LABELS } from './permissions';

export type SignedInUser = {
  name: string;
  /** First letter of the name, for the round avatar. */
  initial: string;
  /** "Owner", "Admin", "Staff" — what the line under the name says. */
  roleLabel: string;
  /** The organizer this session acts inside. For an owner it is their own name. */
  organizerName: string;
  /** The sidebar items this person has a reason to open. */
  nav: { marketing: boolean; team: boolean; activity: boolean };
  /**
   * The organizers a staff member can switch between. Empty for an owner, and
   * for a staff member who works for only one — a switcher with one choice is
   * a control that does nothing.
   */
  organizers: { id: string; name: string; current: boolean }[];
};

export async function getSignedInUser(): Promise<SignedInUser | null> {
  const actor = await getActor();
  if (!actor) return null;

  let name = actor.name;
  let organizerName = actor.name;
  let organizers: SignedInUser['organizers'] = [];

  if (actor.kind !== 'STAFF') {
    const organizer = await prisma.organizer.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    name = organizer?.name ?? actor.name;
    organizerName = name;
  } else {
    const memberships = await prisma.staffMembership.findMany({
      where: activeMembershipWhere(actor.id),
      orderBy: { acceptedAt: 'asc' },
      select: { organizerId: true, organizer: { select: { name: true } } },
    });
    organizerName =
      memberships.find(membership => membership.organizerId === actor.orgId)?.organizer.name ?? '';
    if (memberships.length > 1) {
      organizers = memberships.map(membership => ({
        id: membership.organizerId,
        name: membership.organizer.name,
        current: membership.organizerId === actor.orgId,
      }));
    }
  }

  name = name.trim();
  if (!name) return null;

  return {
    name,
    initial: name.charAt(0).toUpperCase(),
    roleLabel: actor.role === 'SUPER_ADMIN' ? 'Super Admin' : ROLE_LABELS[actor.role],
    organizerName,
    nav: {
      marketing: canSomewhere(actor, 'promo:view'),
      team: can(actor, 'team:manage', { organizerId: actor.orgId }),
      activity: can(actor, 'activity:view', { organizerId: actor.orgId }),
    },
    organizers,
  };
}
