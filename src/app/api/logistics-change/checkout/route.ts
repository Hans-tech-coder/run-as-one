/**
 * Pay now on a delivery switch's payment page (`/pay/logistics/[token]`,
 * LOGISTICS_CHANGE_PLAN.md Session 3): opens a PayMongo page for a switch
 * waiting for its fee and answers its URL. A copy of
 * `api/category-change/checkout`, claim hardening included.
 *
 * **Public, so rate-limited** (`PAY_LINK_RULE`), and it trusts nothing but the
 * signed token. What PayMongo is asked to charge is read from the stored
 * switch: its `fee`, plus the transaction fee on top for the method offered,
 * computed here and written on the switch in the same claim that stores the
 * page id, so the row says exactly what the page charges and the webhook
 * applies it with those figures.
 *
 * **One switch, one payable page**:
 *
 *  1. The switch must still be payable (`switchPayableStateOf`: waiting, hold
 *     not lapsed, deadline not passed). Anything else answers with its state,
 *     and the page reloads into the matching panel.
 *  2. **Was the last page paid?** If PayMongo says so, the switch is settled
 *     here exactly as the webhook would settle it.
 *  3. **Close the last page** before opening a new one, so the runner can
 *     never pay twice. If it will not close, a payment may be under way.
 *  4. Open the new page, judge the switch payable again (a hold or deadline
 *     that lapsed while PayMongo answered gets no payable page), and **claim
 *     it** only if the switch still points at the page closed in step 3, is
 *     still waiting and its hold has not lapsed. The loser of a race closes
 *     its own page and asks for a reload.
 *
 * The page carries the switch's `changeRef` as its `reference_number`, so the
 * webhook finds it by its stored id or by its reference either way. Opening a
 * page for a switch first opened for GCash or bank turns it into an online
 * one; its hold is not moved.
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { PAY_LINK_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { transactionFeeFor } from '@/lib/free-checkout';
import { onlineChangeMethod } from '@/lib/category-change-hold';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';
import {
  readSwitchForPayment,
  receiptOf,
  settleSwitchOnline,
  switchPayableStateOf,
} from '@/lib/logistics-change-payment';
import { lookUpPaymongoPayment } from '@/lib/online-payment';
import { openPaymongoPage, retirePaymongoPage } from '@/lib/paymongo-session';
import { readSwitchPaymentToken } from '@/lib/resume-payment';
import { eventOrigin } from '@/lib/site-host';

export async function POST(request: Request) {
  if (!allowRequest('switch-pay-link', callerKey(request), PAY_LINK_RULE)) {
    return NextResponse.json(
      { error: 'Too many tries from this connection. Wait a minute, then press Pay now again.' },
      { status: 429 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    const changeId = token ? await readSwitchPaymentToken(token) : null;
    const change = changeId ? await readSwitchForPayment(changeId) : null;
    if (!change) {
      return NextResponse.json({ state: 'invalid', error: 'This payment link is not valid any more.' }, { status: 404 });
    }

    const state = switchPayableStateOf(change);
    if (state !== 'payable') {
      return NextResponse.json({ state, error: 'This switch can no longer be paid here.' }, { status: 409 });
    }

    const method = onlineChangeMethod();
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!method || !secretKey || secretKey === 'sk_test_PLACEHOLDER_KEY') {
      console.error('Delivery switch checkout: PayMongo is not set up');
      return NextResponse.json({ error: 'Online payment is not available right now. Please try again later.' }, { status: 503 });
    }

    const previous = change.checkoutSessionId;
    if (previous) {
      const lookup = await lookUpPaymongoPayment(previous);
      if ('paid' in lookup && lookup.paid) {
        await settleSwitchOnline(change.id);
        return NextResponse.json({ state: 'applied' }, { status: 409 });
      }
      const retired = await retirePaymongoPage(secretKey, previous);
      if (!retired.ok) return NextResponse.json({ error: retired.error }, { status: 409 });
    }

    // PayMongo's cut is the runner's, on top, exactly as at checkout (L7).
    const transactionFee = transactionFeeFor(change.fee, method);
    const totalCharged = change.fee + transactionFee;
    const order = receiptOf(change);
    const origin = eventOrigin(change.event, request.url);
    const back = `${origin}/pay/logistics/${token}`;
    const page = await openPaymongoPage(
      secretKey,
      {
        orderRef: change.changeRef,
        amountCents: totalCharged,
        paymentMethod: method,
        description: `Kit delivery for ${change.event.title}`,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        runners: [],
        subtotalCents: change.fee,
        discountAmount: 0,
        promoCode: null,
        // The fee is the one item below; a delivery line too would bill it twice.
        deliveryFeeCents: 0,
        platformFeeCents: 0,
        transactionFeeCents: transactionFee,
        items: [{ name: `Kit delivery for order ${order.orderRef}`, amount: change.fee }],
      },
      { successUrl: `${back}?paid=1`, cancelUrl: back },
    );
    if (!page.ok) {
      console.error('Delivery switch checkout: PayMongo refused a page', page.error, page.details);
      return NextResponse.json(
        { error: 'PayMongo could not open a payment page just now. Wait a minute and try again.' },
        { status: 502 },
      );
    }

    // Judged again after PayMongo answered: a hold or deadline that lapsed while
    // the page was opening must not get a payable page.
    const now = new Date();
    if (switchPayableStateOf(change, now) !== 'payable') {
      await retirePaymongoPage(secretKey, page.id);
      return NextResponse.json({ state: 'expired', error: 'This switch can no longer be paid here.' }, { status: 409 });
    }
    const claim = await db.logisticsChange.updateMany({
      where: {
        id: change.id,
        status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT,
        checkoutSessionId: previous,
        OR: [{ holdUntil: null }, { holdUntil: { gt: now } }],
      },
      data: { checkoutSessionId: page.id, paymentMethod: method, transactionFee, totalCharged },
    });
    if (claim.count === 0) {
      await retirePaymongoPage(secretKey, page.id);
      return NextResponse.json(
        { error: 'This switch moved while its payment page was opening. Reload this page and try again.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ checkout_url: page.checkoutUrl });
  } catch (error) {
    console.error('Delivery switch checkout failed:', error);
    return NextResponse.json({ error: 'Something went wrong opening the payment page. Try again.' }, { status: 500 });
  }
}
