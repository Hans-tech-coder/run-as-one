/**
 * The payment link of an upgrade waiting for its money (CATEGORY_CHANGE_PLAN.md
 * Session 3), from the runner's change history. The link is a signed token of
 * the second kind (lib/resume-payment.ts); who may have one, and for which
 * change, is lib/category-change-payment.ts. This route decides only where it
 * goes, from `via` in the body, as an order's link does
 * (`api/admin/registrations/[id]/payment-link`):
 *
 * - **`copy`** (the default) — the link, for a chat app.
 * - **`email`** — the created email (the link and the breakdown) through
 *   Resend; the outcome is stamped on the change, and a refusal comes back with
 *   the rendered message for the by-hand send.
 * - **`manual`** — the same email rendered, to send from staff's own mailbox.
 *   Marking it sent is the email route's `mark-sent` with `kind: 'created'`.
 *
 * **One trail row per call**: a link is a key to a payment, so every one made
 * is recorded with who made it and what became of it.
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { deliverCreatedEmail, issueChangePaymentLink, renderCreatedEmail } from '@/lib/category-change-payment';
import { readCategoryChangeView } from '@/lib/category-change-view';
import { isOutsidePayment } from '@/lib/category-change-hold';

type Via = 'copy' | 'email' | 'manual';

function asVia(value: unknown): Via | null {
  if (value === undefined || value === null) return 'copy';
  return value === 'copy' || value === 'email' || value === 'manual' ? value : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const via = asVia(body?.via);
    if (!via) return NextResponse.json({ error: 'Say how the link goes out: copy, email or manual.' }, { status: 400 });

    const { id } = await params;
    const link = await issueChangePaymentLink(id, actor, request.url);
    if (!link.ok) return NextResponse.json({ error: link.error }, { status: link.status });
    const { change, url, until, untilLabel } = link;

    const record = (summary: string) =>
      recordAudit(db, actor, {
        action: 'category_change.payment_link.copied',
        entityType: 'CategoryChange',
        entityId: change.id,
        eventId: change.eventId,
        organizerId: change.event.organizerId,
        summary,
      });
    const expiry = { expiresBy: until.toISOString(), untilLabel };
    const ref = change.changeRef;

    if (via === 'copy') {
      // A GCash or bank change is paid outside the app; its page has nothing to pay.
      if (isOutsidePayment(change.paymentMethod)) {
        return NextResponse.json(
          { error: `${ref} is paid by GCash or bank transfer, so it has no payment link. Email the runner how to pay instead.` },
          { status: 400 },
        );
      }
      await record(`Copied the payment link for category change ${ref}, valid until ${untilLabel}.`);
      return NextResponse.json({ url, ...expiry });
    }
    if (via === 'manual') {
      const message = await renderCreatedEmail(change, request.url);
      await record(`Prepared the payment link email for category change ${ref} to send by hand.`);
      return NextResponse.json({
        message: { to: message.to, subject: message.subject, html: message.html, text: message.text },
        ...expiry,
      });
    }
    const email = await deliverCreatedEmail(id, request.url);
    await record(
      email.sent
        ? `Emailed the payment link for category change ${ref} to ${email.to}.`
        : `Could not email the payment link for category change ${ref} (${email.error}). Prepared it to send by hand.`,
    );
    return NextResponse.json({ email, change: await readCategoryChangeView(id), ...expiry });
  } catch (error) {
    console.error('Category change payment link failed:', error);
    return NextResponse.json({ error: 'The payment link could not be made. Try again.' }, { status: 500 });
  }
}
