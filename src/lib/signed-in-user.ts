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
import { can, canSomewhere, getActor, isClientViewer } from './actor';
import { CLIENT_VIEWER_LABEL, ROLE_LABELS } from './permissions';

export type SignedInUser = {
  name: string;
  /** First letter of the name, for the round avatar. */
  initial: string;
  /** The person's profile photo (set in Settings); null draws the initial. */
  avatarUrl: string | null;
  /** "Super Admin", "Admin", "Staff" — what the line under the name says. */
  roleLabel: string;
  /**
   * The organization named under the person: the organizer this session acts
   * inside (for an owner, their own name) — or, for a client viewer, its
   * client, since Run As One's name would tell a viewer nothing.
   */
  organizerName: string;
  /**
   * The sidebar items this person has a reason to open. `platform` is Run As
   * One's own screens — client submissions, clubs and feedback — which were
   * the super admin's sidebar until the dashboards merged. `events` is false
   * only for a client viewer, whose whole sidebar is Dashboard and Settings
   * (ADMIN_MERGE_PLAN.md, Batch 4) — which is also how the route fallback
   * knows to draw a viewer's Overview. `remittances` is the settlement screen
   * (Batch 6).
   */
  nav: {
    events: boolean;
    marketing: boolean;
    team: boolean;
    activity: boolean;
    platform: boolean;
    remittances: boolean;
  };
};

export async function getSignedInUser(): Promise<SignedInUser | null> {
  const actor = await getActor();
  if (!actor) return null;

  let name = actor.name;
  let organizerName = actor.name;
  let avatarUrl: string | null = null;

  if (actor.kind !== 'STAFF') {
    const organizer = await prisma.organizer.findUnique({
      where: { id: actor.id },
      select: { name: true, avatarUrl: true },
    });
    name = organizer?.name ?? actor.name;
    organizerName = name;
    avatarUrl = organizer?.avatarUrl ?? null;
  } else if (isClientViewer(actor) && actor.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: actor.clientId },
      select: { name: true },
    });
    organizerName = client?.name ?? '';
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

  if (actor.kind === 'STAFF') {
    const staff = await prisma.staffAccount.findUnique({
      where: { id: actor.id },
      select: { avatarUrl: true },
    });
    avatarUrl = staff?.avatarUrl ?? null;
  }

  name = name.trim();
  if (!name) return null;

  return {
    name,
    initial: name.charAt(0).toUpperCase(),
    avatarUrl,
    roleLabel: actor.role === 'VIEWER' ? CLIENT_VIEWER_LABEL : ROLE_LABELS[actor.role],
    organizerName,
    nav: {
      events: !isClientViewer(actor),
      marketing: canSomewhere(actor, 'promo:view'),
      team: can(actor, 'team:manage', { organizerId: actor.orgId }),
      activity: can(actor, 'activity:view', { organizerId: actor.orgId }),
      platform: can(actor, 'platform:manage', { organizerId: actor.orgId }),
      remittances: can(actor, 'remittance:manage', { organizerId: actor.orgId }),
    },
  };
}
