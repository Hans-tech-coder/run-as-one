/**
 * Who is signed into the admin, as the sidebar needs to show them.
 *
 * The dashboard's sidebar puts a name and an avatar initial above the logout
 * button, so it reads the signed-in account from here instead of hardcoding a
 * placeholder.
 *
 * The auth cookie already carries a name, but it only carries the one the
 * token was issued with: a rename from the settings screen would leave the sidebar showing a
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
import { can, canSomewhere, getActor } from './actor';
import { CLIENT_VIEWER_LABEL, ROLE_LABELS } from './permissions';

export type SignedInUser = {
  name: string;
  /** First letter of the name, for the round avatar. */
  initial: string;
  /** "Owner", "Admin", "Staff" — what the line under the name says. */
  roleLabel: string;
  /** The organizer this session acts inside. For an owner it is their own name. */
  organizerName: string;
  /**
   * The sidebar items this person has a reason to open. `platform` is Run As
   * One's own screens — organizer applications, clubs and feedback — which were
   * the super admin's sidebar until the dashboards merged.
   */
  nav: { marketing: boolean; team: boolean; activity: boolean; platform: boolean };
};

export async function getSignedInUser(): Promise<SignedInUser | null> {
  const actor = await getActor();
  if (!actor) return null;

  let name = actor.name;
  let organizerName = actor.name;

  if (actor.kind !== 'STAFF') {
    const organizer = await prisma.organizer.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    name = organizer?.name ?? actor.name;
    organizerName = name;
  } else {
    // There is one tenant — Run As One's own organizer row — so there is no
    // longer a switcher listing the others (ADMIN_MERGE_PLAN.md, Batch 2); the
    // session's organizer is only named under the person.
    const organizer = await prisma.organizer.findUnique({
      where: { id: actor.orgId },
      select: { name: true },
    });
    organizerName = organizer?.name ?? '';
  }

  name = name.trim();
  if (!name) return null;

  return {
    name,
    initial: name.charAt(0).toUpperCase(),
    roleLabel:
      actor.role === 'SUPER_ADMIN'
        ? 'Super Admin'
        : actor.role === 'VIEWER'
          ? CLIENT_VIEWER_LABEL
          : ROLE_LABELS[actor.role],
    organizerName,
    nav: {
      marketing: canSomewhere(actor, 'promo:view'),
      team: can(actor, 'team:manage', { organizerId: actor.orgId }),
      activity: can(actor, 'activity:view', { organizerId: actor.orgId }),
      platform: can(actor, 'platform:manage', { organizerId: actor.orgId }),
    },
  };
}
