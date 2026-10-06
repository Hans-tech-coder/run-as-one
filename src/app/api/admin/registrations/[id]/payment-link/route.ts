/**
 * A payment link for an unpaid order on the Unpaid checkouts tab: a link the
 * runner opens to finish paying an order they abandoned, without registering
 * again (UNPAID_FOLLOWUP_PLAN.md Batches 3 and 4). The link itself is a signed
 * token (lib/resume-payment.ts); who may have one, for which order, and the
 * hold it moves are lib/payment-link.ts. This route decides only where the
 * link goes, from `via` in the body:
 *
 * - **`copy`** (the default, Batch 3): the link, for a chat app.
 * - **`email`** — *Send payment link*: the email (lib/email.ts) through
 *   Resend, one of the 100 a day the free tier allows (decision D7). A send
 *   Resend refuses comes back with the rendered message, so the staff member
 *   lands in the by-hand modal with it, the way a registration email that
 *   failed is sent by hand (lib/email-delivery.ts).
 * - **`manual`** — *Send by hand*: the same email rendered, for the staff
 *   member to send from their own mailbox at no quota. Marking it sent is the
 *   follow-up route's "Link sent".
 *
 * **One trail row per call.** A link is a key to the order, so every one made
 * is recorded with who made it. An email that went out is recorded as the
 * follow-up "Link sent" (lib/follow-up.ts), so the Follow-up column shows it
 * and the next staff member does not send another; every other outcome is a
 * `registration.payment_link.copied` row saying what became of the link. The
 * row of the call that moved the hold carries the move.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getActor } from '@/lib/actor';
import { recordAudit, type AuditChanges } from '@/lib/audit';
import { paymentLinkEmail, sendPaymentLinkEmail } from '@/lib/email';
import type { LinkSentVia } from '@/lib/follow-up';
import { issuePaymentLink } from '@/lib/payment-link';

type Via = 'copy' | 'email' | 'manual';

function asVia(value: unknown): Via | null {
  if (value === undefined || value === null) return 'copy';
  return value === 'copy' || value === 'email' || value === 'manual' ? value : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const via = asVia(body?.via);
    if (!via) {
      return NextResponse.json({ error: 'Say how the link goes out: copy, email or manual.' }, { status: 400 });
    }

    const { id } = await params;
    const link = await issuePaymentLink(id, actor, new URL(request.url).origin);
    if (!link.ok) {
      return NextResponse.json({ error: link.error }, { status: link.status });
    }
    const { registration, url, until, untilLabel, moved } = link;
    const ref = registration.orderRef;

    const record = (
      action: 'registration.followed_up' | 'registration.payment_link.copied',
      summary: string,
      changes: AuditChanges = {},
    ) => {
      const all: AuditChanges = moved ? { ...changes, holdUntil: [null, moved.toISOString()] } : changes;
      return recordAudit(prisma, actor, {
        action,
        entityType: 'Registration',
        entityId: id,
        eventId: registration.eventId,
        organizerId: registration.event.organizerId,
        summary: moved ? `${summary} Its slot is held until ${untilLabel}.` : summary,
        changes: Object.keys(all).length > 0 ? all : undefined,
      });
    };
    const expiry = { expiresBy: until.toISOString(), untilLabel };

    if (via === 'copy') {
      await record('registration.payment_link.copied', moved
        ? `Copied a payment link for ${ref}.`
        : `Copied a payment link for ${ref}, valid until ${untilLabel}.`);
      return NextResponse.json({ url, ...expiry });
    }

    const message = await paymentLinkEmail(registration, url, until);
    const sent = { to: message.to, subject: message.subject, html: message.html, text: message.text };

    if (via === 'manual') {
      await record('registration.payment_link.copied', `Prepared a payment link email for ${ref} to send by hand.`);
      return NextResponse.json({ message: sent, ...expiry });
    }

    const outcome = await sendPaymentLinkEmail(message);
    if (outcome.sent) {
      await record('registration.followed_up', `Emailed a payment link for ${ref} to ${message.to}.`, {
        outcome: 'LINK_SENT',
        via: 'email' satisfies LinkSentVia,
      });
      return NextResponse.json({ sent: true, to: message.to, ...expiry });
    }
    // Resend's own words, so a quota stop is not mistaken for a bad address.
    await record('registration.payment_link.copied', `Could not email a payment link for ${ref} (${outcome.error}). Prepared it to send by hand.`);
    return NextResponse.json({ sent: false, error: outcome.error, message: sent, ...expiry });
  } catch (error) {
    console.error('Payment link failed:', error);
    return NextResponse.json({ error: 'The payment link could not be made. Try again.' }, { status: 500 });
  }
}
