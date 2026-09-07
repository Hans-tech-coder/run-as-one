import prisma from './db';
import {
  type EmailMessage,
  type EmailOutcome,
  type RegistrationWithDetails,
  registrationConfirmationEmail,
  registrationReceivedEmail,
  sendRegistrationConfirmationEmail,
  sendRegistrationReceivedEmail,
} from './email';

/**
 * **Whether the runner actually got their email, and what happens when they
 * did not.**
 *
 * The app runs on Resend's free tier in production: 100 recipients a day, and
 * it stops rather than bills. sendEmail() has always caught its failures so a
 * payment can never be undone by a mail server — but it also used to return
 * void, so on the day the ceiling is reached a registration would sit
 * unconfirmed and nothing anywhere said so. This module is the other half of
 * that: it sends through email.ts, writes the outcome onto the registration,
 * and answers which email a row still owes.
 *
 * Every send in the app goes through here rather than calling email.ts
 * directly, because a send whose outcome nobody wrote down is exactly the
 * silence this exists to end.
 *
 * **A hand-sent email stamps the same column as a Resend one.** What these
 * columns record is that the runner *has* the email, not which system
 * delivered it — so once a staff member sends it themselves the row leaves the
 * backlog, and if a later email then fails it rejoins on its own. Who sent it
 * by hand is kept separately, in manualEmailSentBy/At.
 */

/**
 * The two emails a registration can owe. Uppercase like every other coded
 * value crossing the API (PROJECT_GUIDE §9), and guarded rather than trusted:
 * the manual-send route takes this from a request body.
 */
export const EMAIL_KINDS = {
  RECEIVED: 'RECEIVED',
  CONFIRMATION: 'CONFIRMATION',
} as const;

export type EmailKind = (typeof EMAIL_KINDS)[keyof typeof EMAIL_KINDS];

export function asEmailKind(value: unknown): EmailKind | null {
  return value === EMAIL_KINDS.RECEIVED || value === EMAIL_KINDS.CONFIRMATION ? value : null;
}

/** What a person calls each of them. */
export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  RECEIVED: 'Registration Received',
  CONFIRMATION: 'Payment Receipt',
};

/** The columns the backlog rule reads — any row shape carrying them will do. */
export interface EmailDeliveryRecord {
  status: string;
  receivedEmailSentAt: Date | null;
  confirmationEmailSentAt: Date | null;
}

/**
 * Which email this registration still owes, if any.
 *
 * Every registration owes the received email — it is sent at submission, so a
 * row that does not have it never got one. The receipt is only owed once the
 * money is in: a bank transfer sits PENDING for days and has no receipt to be
 * missing yet. When both are outstanding the received one is named first,
 * because it is the one that tells the runner their details were captured.
 */
export function outstandingEmail(registration: EmailDeliveryRecord): EmailKind | null {
  if (!registration.receivedEmailSentAt) return EMAIL_KINDS.RECEIVED;
  if (registration.status === 'PAID' && !registration.confirmationEmailSentAt) {
    return EMAIL_KINDS.CONFIRMATION;
  }
  return null;
}

/**
 * The email to show when nothing is outstanding — the last one this
 * registration was due — so the modal always has something to display and a
 * staff member can resend on request rather than hitting an empty panel.
 */
export function latestEmailKind(registration: EmailDeliveryRecord): EmailKind {
  return registration.status === 'PAID' ? EMAIL_KINDS.CONFIRMATION : EMAIL_KINDS.RECEIVED;
}

/** The rendered email, in both of its renderings. */
export function emailForKind(registration: RegistrationWithDetails, kind: EmailKind): EmailMessage {
  return kind === EMAIL_KINDS.CONFIRMATION
    ? registrationConfirmationEmail(registration)
    : registrationReceivedEmail(registration);
}

/** Which timestamp column a given email writes to. */
function sentAtColumn(kind: EmailKind): 'receivedEmailSentAt' | 'confirmationEmailSentAt' {
  return kind === EMAIL_KINDS.CONFIRMATION ? 'confirmationEmailSentAt' : 'receivedEmailSentAt';
}

/**
 * Write down what happened.
 *
 * Wrapped in its own try/catch and deliberately silent on failure: this is
 * bookkeeping about an email, and a checkout must not fail because the
 * bookkeeping write did. A lost record here shows the registration in the
 * backlog, which is the safe direction to be wrong in — a staff member sends
 * a duplicate at worst.
 */
async function recordOutcome(
  registrationId: string,
  kind: EmailKind,
  outcome: EmailOutcome
): Promise<void> {
  try {
    await prisma.registration.update({
      where: { id: registrationId },
      data: outcome.sent
        ? // The error is cleared on success: it describes the *last* failure,
          // and one still standing beside a delivered email would read as a
          // problem nobody has fixed.
          { [sentAtColumn(kind)]: new Date(), lastEmailError: null }
        : { lastEmailError: outcome.error },
    });
  } catch (err) {
    console.error('Could not record the email outcome for registration', registrationId, err);
  }
}

/**
 * Send the received email and write down whether it went out.
 *
 * Called by both checkout routes at the moment the registration row is
 * created — see the note at the top of email.ts on why this email exists.
 */
export async function deliverReceivedEmail(registration: RegistrationWithDetails): Promise<void> {
  const outcome = await sendRegistrationReceivedEmail(registration);
  await recordOutcome(registration.id, EMAIL_KINDS.RECEIVED, outcome);
}

/**
 * Send the receipt and write down whether it went out. Called on the
 * transition into PAID, from the PayMongo webhook or the admin status route.
 */
export async function deliverConfirmationEmail(registration: RegistrationWithDetails): Promise<void> {
  const outcome = await sendRegistrationConfirmationEmail(registration);
  await recordOutcome(registration.id, EMAIL_KINDS.CONFIRMATION, outcome);
}

/**
 * A staff member sent it themselves, from their own mailbox.
 *
 * Stamps the same column an automatic send would, so the row leaves the
 * backlog, and records who did it beside that. The last error is cleared with
 * it: the runner has the email now, whatever Resend said at the time.
 */
export async function recordManualSend(
  registrationId: string,
  kind: EmailKind,
  staffName: string | null
): Promise<void> {
  const now = new Date();
  await prisma.registration.update({
    where: { id: registrationId },
    data: {
      [sentAtColumn(kind)]: now,
      manualEmailSentAt: now,
      manualEmailSentBy: staffName,
      lastEmailError: null,
    },
  });
}
