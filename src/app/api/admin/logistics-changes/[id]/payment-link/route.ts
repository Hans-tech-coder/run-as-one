/**
 * The payment link of a delivery switch waiting for its fee
 * (LOGISTICS_CHANGE_PLAN.md Session 3), from the receipt's card on Pickup &
 * Delivery. The link is a signed token of the third kind
 * (lib/resume-payment.ts); who may have one, and for which switch, is
 * lib/logistics-change-payment.ts. This route decides only where it goes, from
 * `via` in the body, as a category change's link does:
 *
 * - **`copy`** (the default) — the link, for a chat app. Refused for a switch
 *   paid by GCash or bank: its page has nothing to pay.
 * - **`email`** — the *payment needed* email (the link, or the accounts to pay
 *   to) through Resend; the outcome is stamped on the switch, and a refusal
 *   comes back with the rendered message for the by-hand send.
 *
 * **One trail row per call**: a link is a key to a payment, so every one made
 * is recorded with who made it and what became of it.
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { isOutsidePayment } from '@/lib/category-change-hold';
import { deliverSwitchEmail, issueSwitchPaymentLink } from '@/lib/logistics-change-payment';
import { readLogisticsChangeView } from '@/lib/logistics-change-view';

type Via = 'copy' | 'email';

function asVia(value: unknown): Via | null {
  if (value === undefined || value === null) return 'copy';
  return value === 'copy' || value === 'email' ? value : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const via = asVia(body?.via);
    if (!via) return NextResponse.json({ error: 'Say how the link goes out: copy or email.' }, { status: 400 });

    const { id } = await params;
    const link = await issueSwitchPaymentLink(id, actor, request.url);
    if (!link.ok) return NextResponse.json({ error: link.error }, { status: link.status });
    const { change, url, until, untilLabel } = link;
    const ref = change.changeRef;
    const outside = isOutsidePayment(change.paymentMethod);

    const record = (summary: string) =>
      recordAudit(db, actor, {
        action: 'logistics_change.payment_link.copied',
        entityType: 'LogisticsChange',
        entityId: change.id,
        eventId: change.eventId,
        organizerId: change.event.organizerId,
        summary,
      });
    const expiry = { expiresBy: until.toISOString(), untilLabel };

    if (via === 'copy') {
      if (outside) {
        return NextResponse.json(
          { error: `${ref} is paid by GCash or bank transfer, so it has no payment link. Email how to pay instead.` },
          { status: 400 },
        );
      }
      await record(`Copied the payment link for delivery switch ${ref}, valid until ${untilLabel}.`);
      return NextResponse.json({ url, ...expiry });
    }

    const email = await deliverSwitchEmail(id, 'created', request.url);
    const what = outside ? 'how to pay' : 'the payment link';
    await record(
      email.sent
        ? `Emailed ${what} for delivery switch ${ref} to ${email.to}.`
        : `Could not email ${what} for delivery switch ${ref} (${email.error}). Prepared it to send by hand.`,
    );
    return NextResponse.json({ email, change: await readLogisticsChangeView(id), ...expiry });
  } catch (error) {
    console.error('Delivery switch payment link failed:', error);
    return NextResponse.json({ error: 'The payment link could not be made. Try again.' }, { status: 500 });
  }
}
