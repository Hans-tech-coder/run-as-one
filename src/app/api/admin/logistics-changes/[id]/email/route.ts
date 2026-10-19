/**
 * A delivery switch's emails by hand (LOGISTICS_CHANGE_PLAN.md Session 3): the
 * fallback for a send Resend refused, as a category change's is.
 * `registration:email`, scoped to the switch's own race. `via` in the body:
 *
 * - **`manual`** — the email rendered, for the staff member to send from their
 *   own mailbox at no quota. Writes nothing.
 * - **`mark-sent`** — they sent it: stamps the email's `…SentAt` and records who.
 *
 * `kind` says which email: **`created`** — *payment needed*, only while the
 * switch waits for its fee; **`applied`** (the default) — *switched*, only once
 * it applied.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';
import { LogisticsChangeRefused, findSwitchReach } from '@/lib/logistics-change-context';
import { markSwitchEmailSentByHand, readSwitchForPayment, renderSwitchEmail } from '@/lib/logistics-change-payment';
import { readLogisticsChangeView } from '@/lib/logistics-change-view';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findSwitchReach(id);
    if (!reach || !can(actor, 'registration:email', reach)) {
      return NextResponse.json({ error: 'Delivery switch not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const via = body.via === 'manual' || body.via === 'mark-sent' ? body.via : null;
    if (!via) return NextResponse.json({ error: 'Say what to do with the email: manual or mark-sent.' }, { status: 400 });
    const kind = body.kind === 'created' ? 'created' : 'applied';

    const change = await readSwitchForPayment(id);
    if (!change) return NextResponse.json({ error: 'Delivery switch not found' }, { status: 404 });
    const wanted =
      kind === 'created'
        ? change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT
        : change.status === LOGISTICS_CHANGE_STATUSES.APPLIED;
    if (!wanted) {
      return NextResponse.json(
        {
          error:
            kind === 'created'
              ? 'This switch is no longer waiting for payment, so its payment email is not needed.'
              : 'This switch has not applied, so there is no email about it to send.',
        },
        { status: 409 },
      );
    }

    if (via === 'manual') {
      const message = await renderSwitchEmail(change, kind, request.url);
      return NextResponse.json({
        message: { to: message.to, subject: message.subject, html: message.html, text: message.text },
      });
    }
    await markSwitchEmailSentByHand(actor, id, kind);
    return NextResponse.json({ change: await readLogisticsChangeView(id) });
  } catch (error) {
    if (error instanceof LogisticsChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Delivery switch email failed:', error);
    return NextResponse.json({ error: 'The email could not be prepared. Try again.' }, { status: 500 });
  }
}
