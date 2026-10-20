import { Resend } from 'resend';
import { DEFAULT_CONTACT_EMAIL, SITE_NAME, canSendFrom } from './site-contact';
import { getContactEmail } from './site-settings';

/**
 * **The one Resend call, and who it may reach.** Split out of email-document.ts
 * (on the split-candidates list), which re-exports `sendEmail` so every email
 * module still imports it from there.
 *
 * **Outside production, every email goes to the owner's own inbox**
 * (`TEST_INBOX`), the owner's rule of 2026-10-20: a test on localhost or on a
 * `dev` preview deployment must never reach a registrant, even when it runs on
 * a copy of real orders. Only Vercel Production (`main`, `VERCEL_ENV ===
 * 'production'`) sends to the real address. Anything else — localhost, where
 * `VERCEL_ENV` is unset, a preview, a script — is redirected, so a missing
 * variable fails safe. A redirected email keeps its body and says in its
 * subject who it was for.
 */

/** Where every email goes outside production. */
export const TEST_INBOX = 'obenahans@gmail.com';

/** Whether this deployment may email the real recipient: Vercel Production only. */
export function sendsToRealRecipients(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/** The message as it may actually go out from here. */
export function deliverableMessage(message: EmailMessage): EmailMessage {
  if (sendsToRealRecipients()) return message;
  if (message.to.trim().toLowerCase() === TEST_INBOX) return message;
  return { ...message, to: TEST_INBOX, subject: `[TEST for ${message.to}] ${message.subject}` };
}

/**
 * The sender line every email goes out under.
 *
 * The display name is **quoted**. The name comes from `SITE_NAME`, and it once
 * held a colon — one of RFC 5322's specials, at which a parser stops and drops
 * the rest of a bare display-name wherever the receiving client decides.
 * Quoting keeps the whole name one atom whatever the constant holds.
 *
 * The address is the saved contact email when Resend can send from its domain
 * (`canSendFrom`), and the verified default otherwise — replies still reach the
 * saved address through `replyTo`, so a runner never notices the difference.
 */
function fromAddress(contactEmail: string): string {
  const sender = canSendFrom(contactEmail) ? contactEmail : DEFAULT_CONTACT_EMAIL;
  return `"${SITE_NAME}" <${sender}>`;
}

let client: Resend | null = null;

/** Null when RESEND_API_KEY is unset, so local dev without it just skips sending. */
function resendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set — skipping email send.');
    return null;
  }
  if (!client) client = new Resend(apiKey);
  return client;
}

/** One email in both of its renderings: ready to send, or to hand to a person. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Whether a send actually happened, and why not when it did not.
 *
 * The reason is kept in Resend's own words rather than mapped to a code of
 * ours: the distinction that matters to whoever clears the backlog is a quota
 * stop ("daily limit reached") against a bad address, and their message says
 * which without us having to enumerate their failures in advance.
 */
export type EmailOutcome = { sent: true } | { sent: false; error: string };

export async function sendEmail(original: EmailMessage): Promise<EmailOutcome> {
  const resend = resendClient();
  // Not a failure being swallowed: nothing is configured, so nothing was
  // sent, and the registration should say exactly that rather than imply the
  // runner has an email they never got.
  if (!resend) {
    return { sent: false, error: 'Email is not configured (RESEND_API_KEY is unset), so nothing was sent.' };
  }

  const message = deliverableMessage(original);
  if (message !== original) console.info(`Test send: ${original.to} redirected to ${message.to}.`);

  try {
    const contactEmail = await getContactEmail();
    const { error } = await resend.emails.send({
      from: fromAddress(contactEmail),
      // One recipient, deliberately. Resend meters its free tier by
      // *recipient*, not by message, and counts a bcc as one of them — so the
      // archive copy this used to carry doubled the quota cost of every send,
      // putting a registration's two emails at four units against a ceiling of
      // a hundred a day. Resend's own dashboard already keeps a log of
      // everything sent, which is what the archive mailbox was for.
      to: message.to,
      replyTo: contactEmail,
      subject: message.subject,
      html: message.html,
      // The text alternative exists anyway now that the template renders one,
      // and every spam filter that looks treats a multipart email as less
      // suspect than an HTML-only one.
      text: message.text,
    });
    if (error) {
      console.error('Resend send failed:', error);
      return { sent: false, error: error.message || String(error) };
    }
    return { sent: true };
  } catch (err) {
    console.error('Resend send threw:', err);
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
