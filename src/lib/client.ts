/**
 * Where a client stands, and which moves between standings are allowed.
 *
 * A client is an organization Run As One runs races for (ADMIN_MERGE_PLAN.md).
 * It arrives through the *Apply as an Organizer* form, waits in the
 * submissions list, and is let in only when a staff member presses **Send
 * invite** — nothing is sent on submit, and nothing is approved or rejected.
 *
 * - `NEW` — submitted, nobody has invited them yet.
 * - `INVITED` — an invitation to sign in as a viewer has gone out.
 * - `ACTIVE` — somebody accepted it; the client's viewers can sign in.
 * - `ARCHIVED` — kept on record, out of the queue. Never a delete.
 *
 * `/admin/clients`, the routes that move a status and `getActor()` all
 * read this module, the same job `organizer-status.ts` did for the approval
 * flow it replaces. `Client.status` is plain text, so a status added later
 * needs an entry here and no migration.
 *
 * Prisma-free, so client components can import it.
 */

export const CLIENT_STATUSES = ['NEW', 'INVITED', 'ACTIVE', 'ARCHIVED'] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/** The status, or null when it is not one this app knows. */
export function asClientStatus(value: unknown): ClientStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return (CLIENT_STATUSES as readonly string[]).includes(upper) ? (upper as ClientStatus) : null;
}

/** How each status is put to staff. `badge` is the `.status-badge` tone in Admin.css. */
export const CLIENT_STATUS_COPY: Record<
  ClientStatus,
  { label: string; badge: 'neutral' | 'success' | 'danger' | 'pending' }
> = {
  NEW: { label: 'New', badge: 'neutral' },
  INVITED: { label: 'Invited', badge: 'pending' },
  ACTIVE: { label: 'Active', badge: 'success' },
  ARCHIVED: { label: 'Archived', badge: 'neutral' },
};

/** The label for a stored status, falling back to the stored text rather than to nothing. */
export function clientStatusLabel(status: string): string {
  const known = asClientStatus(status);
  return known ? CLIENT_STATUS_COPY[known].label : status;
}

/**
 * The one status whose viewers may sign in. An allowlist, like
 * `organizerCanSignIn`: an archived client's viewers are refused on their next
 * request, and a status added later is refused until somebody decides
 * otherwise. INVITED is not on it — the acceptance that makes a viewer's
 * password is the same write that makes the client ACTIVE (Batch 3), so no
 * viewer can hold a usable session on a client still waiting.
 */
export const VIEWER_SIGN_IN_STATUSES: readonly ClientStatus[] = ['ACTIVE'];

export function clientViewersCanSignIn(status: string): boolean {
  return (VIEWER_SIGN_IN_STATUSES as readonly string[]).includes(status);
}

/**
 * The moves each status allows. An invitation can be sent from NEW, sent again
 * from INVITED or ACTIVE (a second contact person, or a lost email), and
 * accepted from INVITED. Anything but an archived client can be archived, and
 * an archived one comes back as NEW, to be invited again deliberately rather
 * than reactivated behind anyone's back. Nothing goes back to NEW otherwise.
 */
export type ClientMove = 'invite' | 'accept' | 'archive' | 'restore';

const MOVES: Record<ClientStatus, readonly ClientMove[]> = {
  NEW: ['invite', 'archive'],
  INVITED: ['invite', 'accept', 'archive'],
  ACTIVE: ['invite', 'archive'],
  ARCHIVED: ['restore'],
};

export function clientMovesFrom(status: string): readonly ClientMove[] {
  const known = asClientStatus(status);
  return known ? MOVES[known] : [];
}

export function canMoveClient(status: string, move: ClientMove): boolean {
  return clientMovesFrom(status).includes(move);
}

/**
 * Where a move lands. An invite sent again leaves an ACTIVE client ACTIVE —
 * one contact's new invitation must not sign out the viewers already in.
 */
export function clientStatusAfter(status: string, move: ClientMove): ClientStatus | null {
  if (!canMoveClient(status, move)) return null;
  switch (move) {
    case 'invite':
      return status === 'ACTIVE' ? 'ACTIVE' : 'INVITED';
    case 'accept':
      return 'ACTIVE';
    case 'archive':
      return 'ARCHIVED';
    case 'restore':
      return 'NEW';
  }
}

/**
 * The person an application named, as one line — "Ana Cruz" — or empty when
 * it named nobody. Send invite opens on this name, since the contact who
 * applied is almost always who should sign in.
 */
export function clientContactName(client: {
  contactFirstName?: string | null;
  contactLastName?: string | null;
}): string {
  return [client.contactFirstName, client.contactLastName]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ');
}
