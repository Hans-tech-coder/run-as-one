/**
 * Reading clients out of the database, and the one write every event form
 * makes about one: which client a race is for.
 *
 * Kept apart from `client.ts` for the reason `promo-store.ts` is kept apart
 * from `discount.ts` — that module's rules are imported by client components,
 * and this one brings Prisma.
 *
 * **Linking an event to a client is Run As One's decision** (`platform:manage`),
 * because it decides what that client's viewers can see. An event manager may
 * edit a race without being able to hand its registrant counts to an outside
 * organization, so for anyone else the link is left exactly as it was — the
 * picker is not drawn for them, and a body carrying it anyway changes nothing.
 */

import prisma from './db';
import { can, type Actor } from './actor';

export type ClientLink =
  /** Leave `Event.clientId` as it is. */
  | { ok: true; change: false }
  | { ok: true; change: true; clientId: string | null }
  | { ok: false; error: string };

/**
 * What a posted `clientId` means for an event. Blank or null unlinks it; an id
 * must name a client that exists, and an archived client is refused unless the
 * race is already linked to it — a save that leaves the link alone must never
 * fail over a client archived since.
 */
export async function readClientLink(
  actor: Actor,
  raw: unknown,
  currentClientId: string | null = null,
): Promise<ClientLink> {
  if (raw === undefined) return { ok: true, change: false };
  if (!can(actor, 'platform:manage', { organizerId: actor.orgId })) {
    return { ok: true, change: false };
  }
  if (raw === null || raw === '') return { ok: true, change: true, clientId: null };
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Choose a client from the list, or No client yet.' };
  }
  if (raw === currentClientId) return { ok: true, change: false };

  const client = await prisma.client.findUnique({
    where: { id: raw },
    select: { id: true, name: true, status: true },
  });
  if (!client) {
    return { ok: false, error: 'That client no longer exists. Choose another, or No client yet.' };
  }
  if (client.status === 'ARCHIVED') {
    return {
      ok: false,
      error: `${client.name} is archived. Restore it on the Clients screen before linking a race to it.`,
    };
  }
  return { ok: true, change: true, clientId: client.id };
}
