/**
 * Invitation links: making one, finding the membership behind one, and
 * sending it.
 *
 * **The token is only ever in the link.** What the database keeps is its
 * sha256 (`StaffMembership.inviteTokenHash`), made by lib/secret-token.ts —
 * the helper the password-reset link shares.
 *
 * **One person, one credential** (STAFF_ACCESS_PLAN.md §1.5). The owner never
 * sets a password for anyone; the link lets the invitee choose their own, and
 * a person who already has an account accepts by proving the password they
 * already use. A resend issues a new token and kills the old one, so a link
 * forwarded before the resend stops working.
 *
 * **A client viewer is invited through the same machinery** (ADMIN_MERGE_PLAN.md,
 * Batch 3): a `VIEWER` membership carrying `clientId`, the same hashed token,
 * the same accept page. Only the email differs — `sendInvitation` reads the
 * membership's role and sends the client wording rather than the team's.
 *
 * Kept apart from lib/team.ts because node:crypto and Prisma cannot travel to
 * the browser, and that module's rules do.
 */

import prisma from './db';
import { sendClientInvitationEmail, sendStaffInvitationEmail } from './email-invitations';
import type { EmailOutcome } from './email-document';
import { ROLE_LABELS, asEventRole, asTeamRole } from './permissions';
import { SITE_URL } from './site-contact';
import { INVITE_TTL_DAYS } from './team';
import { hashSecretToken, isSecretToken, newSecretToken } from './secret-token';

export const hashInviteToken = hashSecretToken;

/** A fresh link's token, the hash to store, and when it stops working. */
export function newInvitation(now = new Date()) {
  return {
    ...newSecretToken(),
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/**
 * The invitation a link opens, or null when it is malformed, unknown, already
 * accepted or expired. All four read the same to the person holding the link —
 * which of them it was is not something a stranger with a guessed URL should
 * learn.
 */
export async function findOpenInvitation(token: unknown) {
  if (!isSecretToken(token)) return null;

  const membership = await prisma.staffMembership.findFirst({
    where: { inviteTokenHash: hashInviteToken(token), acceptedAt: null },
    select: {
      id: true,
      role: true,
      staffId: true,
      organizerId: true,
      clientId: true,
      inviteExpiresAt: true,
      client: { select: { id: true, name: true, status: true } },
      staff: { select: { id: true, name: true, email: true, password: true, status: true } },
      organizer: { select: { name: true, status: true } },
      assignments: {
        orderBy: { createdAt: 'asc' },
        select: { role: true, event: { select: { title: true } } },
      },
    },
  });

  if (!membership?.inviteExpiresAt || membership.inviteExpiresAt.getTime() <= Date.now()) {
    return null;
  }
  return membership;
}

export type OpenInvitation = NonNullable<Awaited<ReturnType<typeof findOpenInvitation>>>;

/**
 * Where the link in the email points. Production answers on one hostname only
 * (`SITE_URL`), so it is named rather than read off the request; anywhere else
 * — localhost, a preview deployment — the link has to come back to the
 * database it was written into, which is the host that served the request.
 */
export function inviteOrigin(request: Request): string {
  return process.env.VERCEL_ENV === 'production' ? SITE_URL : new URL(request.url).origin;
}

/**
 * Sends the invitation for a membership whose token was just issued.
 *
 * The token arrives as an argument because the database cannot give it back.
 * Like every send in the app this never throws; the route reports a failure so
 * the person inviting can resend rather than wait on an email that never left.
 */
export async function sendInvitation({
  membershipId,
  token,
  origin,
  inviterName,
}: {
  membershipId: string;
  token: string;
  origin: string;
  inviterName: string;
}): Promise<EmailOutcome> {
  const membership = await prisma.staffMembership.findUnique({
    where: { id: membershipId },
    select: {
      role: true,
      inviteExpiresAt: true,
      staff: { select: { name: true, email: true, password: true } },
      organizer: { select: { name: true } },
      client: { select: { name: true } },
      assignments: {
        orderBy: { createdAt: 'asc' },
        select: { role: true, event: { select: { title: true } } },
      },
    },
  });

  if (!membership?.inviteExpiresAt) {
    return { sent: false, error: 'The invitation could not be found to send.' };
  }

  const acceptUrl = `${origin}/admin/invite/${token}`;

  // Development only, on the developer's own console: without it an invitation
  // on a laptop whose email is not configured can never be opened, and the
  // flow could not be tried end to end. Production never prints a token.
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[team] Invitation link for ${membership.staff.email}: ${acceptUrl}`);
  }

  if (membership.role === 'VIEWER') {
    if (!membership.client) {
      return { sent: false, error: 'The client this invitation is for could not be found.' };
    }
    return sendClientInvitationEmail({
      to: membership.staff.email,
      inviteeName: membership.staff.name,
      clientName: membership.client.name,
      acceptUrl,
      expiresAt: membership.inviteExpiresAt,
      hasAccount: Boolean(membership.staff.password),
    });
  }

  return sendStaffInvitationEmail({
    to: membership.staff.email,
    inviteeName: membership.staff.name,
    organizerName: membership.organizer.name,
    inviterName,
    role: asTeamRole(membership.role) ?? 'STAFF',
    events: membership.assignments.map(assignment => ({
      title: assignment.event.title,
      roleLabel: ROLE_LABELS[asEventRole(assignment.role) ?? 'VIEWER'],
    })),
    acceptUrl,
    expiresAt: membership.inviteExpiresAt,
    hasAccount: Boolean(membership.staff.password),
  });
}
