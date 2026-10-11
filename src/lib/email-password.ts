import { SITE_NAME } from './site-contact';
import { formatEventInstant } from './event-schedule';
import { type EmailMessage, type EmailOutcome, renderMessage, sendEmail } from './email-document';

/**
 * The two emails about an admin sign-in's password (LOGIN_UX_PLAN.md Batch 2):
 * the "forgot password" link, and the notice that the password was changed
 * through one. Built and sent through email-document.ts like every other email;
 * lib/password-reset.ts decides when either goes out.
 */

function firstNameOf(name: string): string {
  return name.split(' ')[0] || name;
}

export interface PasswordResetEmailInput {
  to: string;
  name: string;
  resetUrl: string;
  /** How long the link works, in minutes — said in the email as it stands. */
  ttlMinutes: number;
}

/**
 * The link. It says how long it works and that it can be ignored, because the
 * person reading it may not be the one who asked: anyone can type an address
 * into the form, and nothing changes unless the link is used.
 */
export function passwordResetEmail(input: PasswordResetEmailInput): Promise<EmailMessage> {
  return renderMessage({
    to: input.to,
    subject: `Reset your ${SITE_NAME} password`,
    status: { label: 'Password Reset', tone: 'pending' },
    footerTopic: 'password reset',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstNameOf(input.name)}, somebody asked to reset the password for your ${SITE_NAME} sign-in. Choose a new one with the button below.`,
        ],
      },
      { kind: 'button', label: 'Choose a New Password', href: input.resetUrl },
      {
        kind: 'note',
        segments: [
          `This link works once and expires in ${input.ttlMinutes} minutes. Setting a new password signs you out on every device. Did not ask for this? You can ignore this email — your password stays as it is.`,
        ],
      },
    ],
  });
}

export function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<EmailOutcome> {
  return passwordResetEmail(input).then(sendEmail);
}

export interface PasswordChangedEmailInput {
  to: string;
  name: string;
  changedAt: Date;
}

/**
 * The notice after a reset. If the person did not do it, this is how they find
 * out — so it says when, and what to do.
 */
export function passwordChangedEmail(input: PasswordChangedEmailInput): Promise<EmailMessage> {
  return renderMessage({
    to: input.to,
    subject: `Your ${SITE_NAME} password was changed`,
    status: { label: 'Password Changed', tone: 'success' },
    footerTopic: 'password change',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          `Hi ${firstNameOf(input.name)}, the password for your ${SITE_NAME} sign-in was changed through a reset link on ${formatEventInstant(input.changedAt)}, Manila time. Every device that was signed in has been signed out.`,
        ],
      },
      {
        kind: 'note',
        segments: [
          'Was this you? Then there is nothing to do. If it was not, reply to this email right away so we can lock the account.',
        ],
      },
    ],
  });
}

export function sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<EmailOutcome> {
  return passwordChangedEmail(input).then(sendEmail);
}
