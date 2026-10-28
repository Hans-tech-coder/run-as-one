/**
 * The applied email of a category change, after the fact: the by-hand
 * fallback for a send Resend refused (CATEGORY_CHANGE_PLAN.md, the same as
 * lib/email-delivery.ts does for a registration). `registration:email`, scoped
 * to the change's own race. `via` in the body:
 *
 * - **`manual`** — the email rendered, for the staff member to send from their
 *   own mailbox at no quota. Writes nothing for the applied email; the created
 *   one carries a signed payment link, so it writes the same
 *   `category_change.payment_link.copied` row the payment-link route does.
 * - **`mark-sent`** — they sent it: stamps `appliedEmailSentAt` and records who.
 * - **`email`** — try Resend again; the outcome is stamped on the change, and a
 *   refusal comes back with the rendered message.
 *
 * `kind` says which email: **`applied`** (the default) — only an applied change
 * has it; **`created`** (Session 3) — the payment link and breakdown of an
 * upgrade still waiting for its payment (lib/category-change-payment.ts), only
 * while `payableStateOf` calls it payable — the rule `issueChangePaymentLink`
 * applies, so a change whose hold or change deadline has lapsed before the
 * daily sweep gets no link.
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { hasMoved } from '@/lib/category-change';
import { CategoryChangeRefused, findChangeReachById } from '@/lib/category-change-context';
import { markChangeEmailSentByHand } from '@/lib/category-change-store';
import {
  deliverCreatedEmail,
  payableStateOf,
  readChangeForPayment,
  renderCreatedEmail,
} from '@/lib/category-change-payment';
import { deliverAppliedEmail, readCategoryChangeView, renderAppliedEmail } from '@/lib/category-change-view';

type Via = 'manual' | 'mark-sent' | 'email';

function asVia(value: unknown): Via | null {
  return value === 'manual' || value === 'mark-sent' || value === 'email' ? value : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findChangeReachById(id);
    if (!reach || !can(actor, 'registration:email', reach)) {
      return NextResponse.json({ error: 'Category change not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const via = asVia(body.via);
    if (!via) {
      return NextResponse.json({ error: 'Say what to do with the email: manual, mark-sent or email.' }, { status: 400 });
    }

    const kind = body.kind === 'created' ? 'created' : 'applied';
    if (kind === 'created') {
      const change = await readChangeForPayment(id);
      if (!change || payableStateOf(change) !== 'payable') {
        return NextResponse.json(
          { error: 'This change is no longer waiting for payment, so its payment email is not needed.' },
          { status: 409 },
        );
      }
      if (via === 'manual') {
        const message = await renderCreatedEmail(change, request.url);
        await recordAudit(db, actor, {
          action: 'category_change.payment_link.copied',
          entityType: 'CategoryChange',
          entityId: change.id,
          eventId: change.eventId,
          organizerId: change.event.organizerId,
          summary: `Prepared the payment link email for category change ${change.changeRef} to send by hand.`,
        });
        return NextResponse.json({
          message: { to: message.to, subject: message.subject, html: message.html, text: message.text },
        });
      }
      if (via === 'mark-sent') {
        await markChangeEmailSentByHand(actor, id, 'created');
        return NextResponse.json({ change: await readCategoryChangeView(id) });
      }
      const email = await deliverCreatedEmail(id, request.url);
      return NextResponse.json({ email, change: await readCategoryChangeView(id) });
    }

    const change = await db.categoryChange.findUnique({ where: { id }, select: { status: true } });
    if (!change || !hasMoved(change.status)) {
      return NextResponse.json(
        { error: 'This change has not been applied yet, so there is no email about it to send.' },
        { status: 409 },
      );
    }

    if (via === 'manual') {
      const message = await renderAppliedEmail(id);
      return NextResponse.json({
        message: { to: message.to, subject: message.subject, html: message.html, text: message.text },
      });
    }
    if (via === 'mark-sent') {
      await markChangeEmailSentByHand(actor, id, 'applied');
      return NextResponse.json({ change: await readCategoryChangeView(id) });
    }
    const email = await deliverAppliedEmail(id);
    return NextResponse.json({ email, change: await readCategoryChangeView(id) });
  } catch (error) {
    if (error instanceof CategoryChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Category change email failed:', error);
    return NextResponse.json({ error: 'The email could not be prepared. Try again.' }, { status: 500 });
  }
}
