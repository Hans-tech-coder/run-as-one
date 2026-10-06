/**
 * Pay now on the resume-payment page (`/pay/[token]`, UNPAID_FOLLOWUP_PLAN.md
 * Batch 3): opens a fresh PayMongo page for an order the runner abandoned, and
 * answers its URL for the page to send them to — the same answer
 * `api/checkout` gives the wizard.
 *
 * **Public, so rate-limited** (`PAY_LINK_RULE`), and it trusts nothing but the
 * signed token. Everything PayMongo is asked to charge is read from the stored
 * order (lib/paymongo-session.ts), never from the request.
 *
 * **One order, one payable page.** In this order:
 *
 *  1. The order must still be payable (`payableState`): PENDING, inside its
 *     hold, an online method still offered. Anything else answers with its
 *     state, and the page reloads into the matching panel.
 *  2. **Was the last page paid?** A QRPh payment can succeed while its webhook
 *     is late. If PayMongo says it was, the order is settled here, exactly as
 *     the webhook would settle it, and the runner is told it is paid rather
 *     than charged twice.
 *  3. **Close the last page** (`retirePaymongoPage`) before opening a new one,
 *     so the runner can never pay twice for one order. If it will not close, a
 *     payment may be under way, and no new page is opened.
 *  4. Open the new page and **claim it**: the id is written only if the order
 *     still points at the page closed in step 3. Two Pay now presses racing
 *     each other each close and open, but only one is stored; the loser closes
 *     its own page again and asks for a reload, so no second live page is
 *     left behind.
 *
 * The new page carries the same `reference_number`, so the webhook finds the
 * order by its stored id or by its reference either way.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { PAY_LINK_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { lookUpPaymongoPayment, settleOnlinePayment } from '@/lib/online-payment';
import {
  openPaymongoPage,
  paymongoOrderFromRegistration,
  retirePaymongoPage,
} from '@/lib/paymongo-session';
import { payableState, readResumePaymentToken } from '@/lib/resume-payment';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!allowRequest('pay-link', callerKey(request), PAY_LINK_RULE)) {
    return NextResponse.json(
      { error: 'Too many tries from this connection. Wait a minute, then press Pay now again.' },
      { status: 429 }
    );
  }

  try {
    const { token } = await params;
    const registrationId = await readResumePaymentToken(token);
    if (!registrationId) {
      return NextResponse.json({ state: 'invalid', error: 'This payment link is not valid any more.' }, { status: 404 });
    }

    const order = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        event: { select: { title: true, slug: true, shirtSizeUpcharge: true } },
        runners: { where: { deletedAt: null }, orderBy: { runnerNo: 'asc' }, include: { category: true } },
        _count: { select: { runners: { where: { deletedAt: { not: null } } } } },
      },
    });
    if (!order) {
      return NextResponse.json({ state: 'invalid', error: 'This payment link is not valid any more.' }, { status: 404 });
    }

    const state = payableState({
      ...order,
      liveRunners: order.runners.length,
      removedRunners: order._count.runners,
    });
    if (state !== 'payable') {
      return NextResponse.json({ state, error: 'This order can no longer be paid here.' }, { status: 409 });
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey || secretKey === 'sk_test_PLACEHOLDER_KEY') {
      console.error('Pay link: PAYMONGO_SECRET_KEY is not set');
      return NextResponse.json({ error: 'Online payment is not available right now. Please try again later.' }, { status: 503 });
    }

    const previous = order.checkoutSessionId;
    if (previous) {
      // Step 2: the last page may already have been paid.
      const lookup = await lookUpPaymongoPayment(previous);
      if ('paid' in lookup && lookup.paid) {
        await settleOnlinePayment(order.id);
        return NextResponse.json({ state: 'paid' }, { status: 409 });
      }
      // Step 3: close it. A lookup that failed is no reason to stop here: the
      // close is refused for a page with a payment on it, and that refusal is
      // read back below.
      const retired = await retirePaymongoPage(secretKey, previous);
      if (!retired.ok) {
        return NextResponse.json({ error: retired.error }, { status: 409 });
      }
    }

    // Step 4. The success page is the wizard's own, so a runner who pays here
    // lands where a runner paying at checkout does; cancelling comes back to
    // this link.
    const origin = new URL(request.url).origin;
    const page = await openPaymongoPage(secretKey, paymongoOrderFromRegistration(order), {
      successUrl: `${origin}/events/${order.event.slug}/register?success=true&orderRef=${order.orderRef}`,
      cancelUrl: `${origin}/pay/${token}`,
    });
    if (!page.ok) {
      console.error('Pay link: PayMongo refused a new page', page.error, page.details);
      return NextResponse.json(
        { error: 'PayMongo could not open a payment page just now. Wait a minute and try again.' },
        { status: 502 }
      );
    }

    const claim = await prisma.registration.updateMany({
      where: { id: order.id, status: 'PENDING', checkoutSessionId: previous },
      data: { checkoutSessionId: page.id },
    });
    if (claim.count === 0) {
      await retirePaymongoPage(secretKey, page.id);
      return NextResponse.json(
        { error: 'This order changed while its payment page was opening. Reload this page and try again.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ checkout_url: page.checkoutUrl });
  } catch (error) {
    console.error('Pay link failed:', error);
    return NextResponse.json({ error: 'Something went wrong opening the payment page. Try again.' }, { status: 500 });
  }
}
