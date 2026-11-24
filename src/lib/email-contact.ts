import { formatEventInstant } from './event-schedule';
import { CONTACT_TOPIC_LABEL, MAX_CONTACT_NAME, oneLine, type ContactTopic } from './contact-inquiry';
import { renderMessage, type EmailMessage } from './email-document';

/**
 * **The email a Contact Us inquiry becomes** — the only record of it (no table;
 * lib/contact-inquiry.ts says why). It goes *to* the site's contact address and
 * its Reply-To is the sender, so staff answer by pressing Reply. Nothing is
 * sent back to the sender: an auto-reply would let anyone make the app email
 * an address they typed.
 *
 * Built on the shared document (email-document.ts), so every value is escaped
 * by its renderer and the email looks like the app's others. The subject is a
 * header, so the name goes in on one line and capped (`oneLine`).
 */

export interface ContactEmailInput {
  /** The site's contact address, from settings. */
  to: string;
  name: string;
  email: string;
  phone: string;
  topic: ContactTopic;
  /** The race's label, or null when none was chosen. */
  race: string | null;
  message: string;
  /** The host the form was on: runasone.ph, or a client's subdomain. */
  host: string;
  sentAt: Date;
}

export async function contactInquiryEmail(input: ContactEmailInput): Promise<EmailMessage> {
  const topic = CONTACT_TOPIC_LABEL[input.topic];
  const name = oneLine(input.name).slice(0, MAX_CONTACT_NAME);

  // One paragraph per line the sender wrote, so their line breaks survive the
  // HTML rendering (a paragraph block is one <p>). Blank lines are dropped;
  // the paragraph spacing already separates them.
  const lines = input.message.split('\n').map(line => line.trimEnd()).filter(Boolean);

  const message = await renderMessage({
    to: input.to,
    subject: oneLine(`[Contact] ${topic} — ${name}`),
    status: { label: 'New Inquiry', tone: 'pending' },
    footerTopic: 'inquiry',
    blocks: [
      {
        kind: 'paragraph',
        segments: [
          { strong: name },
          ` wrote in through the Contact Us page on ${input.host}. Reply to this email to answer them — it goes to ${input.email}.`,
        ],
      },
      { kind: 'heading', text: 'From' },
      {
        kind: 'card',
        rows: [
          { kind: 'info', label: 'Name', value: name },
          { kind: 'info', label: 'Email', value: input.email },
          { kind: 'info', label: 'Phone', value: input.phone || 'Not given' },
          { kind: 'info', label: 'Topic', value: topic },
          { kind: 'info', label: 'Race', value: input.race ?? 'None chosen' },
          { kind: 'info', label: 'Site', value: input.host },
          { kind: 'info', label: 'Sent', value: `${formatEventInstant(input.sentAt)} (Manila)` },
        ],
      },
      { kind: 'heading', text: 'Message' },
      ...lines.map(line => ({ kind: 'paragraph' as const, segments: [line] })),
    ],
  });

  return { ...message, replyTo: input.email };
}
