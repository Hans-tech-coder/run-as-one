import { SITE_NAME } from './site-contact';
import { formatEventInstant } from './event-schedule';
import { type EmailMessage, type EmailOutcome, type Row, renderMessage, sendEmail } from './email-document';

/**
 * The two emails that invite somebody to sign in, rather than tell a runner
 * about an order: a team member (lib/team-invite.ts) and a client let in as a
 * viewer. Split out of email.ts (UNPAID_FOLLOWUP_PLAN.md Batch 4); built and
 * sent through email-document.ts like every other email.
 */

/* ────────────────────────────────────────────────────────────────────────
 * The team invitation — the one email in the app that is not about an order.
 * ──────────────────────────────────────────────────────────────────────── */

export interface StaffInvitationInput {
  to: string;
  inviteeName: string;
  organizerName: string;
  /** Who pressed Invite. For an owner this is the organizer's own name. */
  inviterName: string;
  role: 'ADMIN' | 'STAFF';
  /** The races a STAFF invitation reaches, and the role on each. Empty for ADMIN. */
  events: { title: string; roleLabel: string }[];
  acceptUrl: string;
  expiresAt: Date;
  /** Whether the address already signs in to another organizer's team. */
  hasAccount: boolean;
}

/**
 * Sent when an owner or admin invites somebody onto their team, and again on
 * a resend (lib/team-invite.ts).
 *
 * It says exactly what is being offered — which races, as what — because the
 * reader is deciding whether to create an account, and "join the team" alone
 * would not tell a freelance timer whether this is the race they agreed to
 * work. It never carries a password, and says plainly that nobody but the
 * invitee will know the one they choose.
 */
export function staffInvitationEmail(input: StaffInvitationInput): Promise<EmailMessage> {
  const firstName = input.inviteeName.split(' ')[0] || input.inviteeName;
  // An owner's name is the organizer's name, and "CRC EVENTS invited you to
  // join CRC EVENTS" reads as a mistake.
  const fromOrganizer = input.inviterName.trim() === input.organizerName.trim();

  const accessRows: Row[] =
    input.role === 'ADMIN'
      ? [
          { kind: 'info', label: 'Role', value: 'Admin' },
          { kind: 'info', label: 'Events', value: 'Every event they run' },
        ]
      : input.events.map(event => ({ kind: 'info' as const, label: event.title, value: event.roleLabel }));

  return renderMessage({
    to: input.to,
    subject: `You're invited to join ${input.organizerName} on ${SITE_NAME}`,
    status: { label: 'Team Invitation', tone: 'pending' },
    footerTopic: 'invitation',
    blocks: [
      {
        kind: 'paragraph',
        segments: fromOrganizer
          ? [`Hi ${firstName}, `, { strong: input.organizerName }, ` has invited you to join their team on ${SITE_NAME}.`]
          : [
              `Hi ${firstName}, `,
              { strong: input.inviterName },
              ' has invited you to join ',
              { strong: input.organizerName },
              ` on ${SITE_NAME}.`,
            ],
      },
      { kind: 'heading', text: 'Your Access' },
      { kind: 'card', rows: accessRows },
      {
        kind: 'paragraph',
        segments: [
          input.hasAccount
            ? `You already have a ${SITE_NAME} account with this address, so you will accept with the password you use now. Your other organizers are not affected.`
            : 'Accepting lets you choose your own password. Nobody else — including the person who invited you — will know it.',
        ],
      },
      { kind: 'button', label: 'Accept Invitation', href: input.acceptUrl },
      {
        kind: 'note',
        segments: [
          `This link works once and expires on ${formatEventInstant(input.expiresAt)}, Manila time. If it has expired, ask for a new one. Not expecting this? You can ignore it — nothing happens unless the link is used.`,
        ],
      },
    ],
  });
}

export function sendStaffInvitationEmail(input: StaffInvitationInput): Promise<EmailOutcome> {
  return staffInvitationEmail(input).then(sendEmail);
}

/* ────────────────────────────────────────────────────────────────────────
 * The client invitation — a submission let in as a viewer (ADMIN_MERGE_PLAN.md).
 * ──────────────────────────────────────────────────────────────────────── */

export interface ClientInvitationInput {
  to: string;
  inviteeName: string;
  /** The organization the application was sent for, `Client.name`. */
  clientName: string;
  acceptUrl: string;
  expiresAt: Date;
  /** Whether the address already has a sign-in on this site. */
  hasAccount: boolean;
}

/**
 * Sent when Run As One staff press **Send invite** on a client submission, and
 * again on a resend (lib/team-invite.ts).
 *
 * Not the team wording: the reader is not joining anybody's team or taking a
 * role on a race. They applied as an organizer, and Run As One runs the race
 * for them, so what this opens is a view of their own events and how many
 * runners have registered — and it says that, including what it does not
 * show, so nobody signs in expecting to edit a race or read a runner list. It
 * never carries a password; the link lets them choose one.
 */
export function clientInvitationEmail(input: ClientInvitationInput): Promise<EmailMessage> {
  const firstName = input.inviteeName.split(' ')[0] || input.inviteeName;

  return renderMessage({
    to: input.to,
    subject: `Your ${SITE_NAME} sign-in for ${input.clientName}`,
    status: { label: 'Organizer Invitation', tone: 'pending' },
    footerTopic: 'invitation',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstName}, thank you for applying to run your events with ${SITE_NAME}. We have set up a sign-in for `,
          { strong: input.clientName },
          '.',
        ],
      },
      { kind: 'heading', text: 'What You Can See' },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Your events', value: 'Every race we run for you' },
          { kind: 'info', label: 'Registrations', value: 'How many runners, paid and pending' },
        ],
      },
      {
        kind: 'paragraph',
        segments: [
          `${SITE_NAME} runs registration and payments for your races, so this view is for following along rather than editing. `,
          input.hasAccount
            ? `You already have a ${SITE_NAME} account with this address, so you will accept with the password you use now.`
            : 'Accepting lets you choose your own password. Nobody at Run As One will know it.',
        ],
      },
      { kind: 'button', label: 'Set Up Your Sign-In', href: input.acceptUrl },
      {
        kind: 'note',
        segments: [
          `This link works once and expires on ${formatEventInstant(input.expiresAt)}, Manila time. If it has expired, reply to this email and we will send a new one.`,
        ],
      },
    ],
  });
}

export function sendClientInvitationEmail(input: ClientInvitationInput): Promise<EmailOutcome> {
  return clientInvitationEmail(input).then(sendEmail);
}
