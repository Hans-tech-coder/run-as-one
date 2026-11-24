import { NextResponse } from 'next/server';
import {
  CONTACT_FIELD_ORDER,
  CONTACT_HONEYPOT,
  cleanContactInput,
  contactInputErrors,
} from '@/lib/contact-inquiry';
import { contactRaces } from '@/lib/contact-races';
import { contactInquiryEmail } from '@/lib/email-contact';
import { sendEmail } from '@/lib/email-document';
import { CONTACT_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { findSiteClient } from '@/lib/site-client';
import { parseSiteLabel, requestPublicUrl } from '@/lib/site-host';
import { getContactEmail } from '@/lib/site-settings';

/**
 * Where the Contact Us form (`/contact`) posts. Public, and the one route that
 * sends an email on a stranger's say-so, so:
 *
 * - **Throttled first** (`CONTACT_RULE`), before the body is read.
 * - **A honeypot**: a filled `website` box is a script. It is answered exactly
 *   like a sent message, so the script learns nothing, and nothing is sent.
 * - **The same rules as the form** (lib/contact-inquiry.ts), each refusal
 *   naming its field. A race must be one the form lists for this host.
 * - **Sent only to the site's contact address**, never to anything the body
 *   names; the sender is the Reply-To, and gets no auto-reply.
 *
 * The address is never in an answer: a failure says only that it failed, and
 * the page shows the address it already shows on purpose.
 */

function refuse(field: string, error: string) {
  return NextResponse.json({ field, error }, { status: 400 });
}

/** The host as the email states it — header text, so held to host characters. */
function cleanHost(host: string): string {
  return host.toLowerCase().replace(/[^a-z0-9.:-]/g, '').slice(0, 100) || 'unknown host';
}

export async function POST(request: Request) {
  try {
    if (!allowRequest('contact', callerKey(request), CONTACT_RULE)) {
      return NextResponse.json(
        {
          error:
            'That is a few messages in a short time. Wait ten minutes and send this one again — your message is still in the box.',
        },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return refuse('message', 'We could not read that message. Please press Send again.');
    }

    // A person never sees this box. Answered as a success on purpose.
    const trap = body[CONTACT_HONEYPOT];
    if (typeof trap === 'string' && trap.trim()) {
      return NextResponse.json({ success: true });
    }

    const input = cleanContactInput(body);
    const errors = contactInputErrors(input);
    const first = CONTACT_FIELD_ORDER.find(field => errors[field]);
    if (first) return refuse(first, errors[first]!);

    const url = requestPublicUrl(request);
    const label = parseSiteLabel(url.host);
    const client = label ? await findSiteClient(label) : null;

    let raceLabel: string | null = null;
    if (input.race) {
      const race = (await contactRaces(client?.id ?? null)).find(r => r.slug === input.race);
      if (!race) return refuse('race', 'That race is not on this site’s list. Choose one from the list, or leave it blank.');
      raceLabel = race.label;
    }

    const to = await getContactEmail();
    const message = await contactInquiryEmail({
      to,
      name: input.name,
      email: input.email,
      phone: input.phone,
      topic: input.topic || 'OTHER',
      race: raceLabel,
      message: input.message,
      host: cleanHost(url.host),
      sentAt: new Date(),
    });

    const outcome = await sendEmail(message);
    if (!outcome.sent) {
      console.error('Contact inquiry was not sent:', outcome.error);
      return NextResponse.json(
        { error: 'Our mail service did not take your message just now, so it was not sent.', unsent: true },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send a contact inquiry:', error);
    return NextResponse.json(
      { error: 'Something went wrong on our side, so your message was not sent.', unsent: true },
      { status: 500 },
    );
  }
}
