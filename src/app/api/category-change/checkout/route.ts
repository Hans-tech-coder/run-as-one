/**
 * Pay now on a category change's payment page (`/pay/change/[token]`,
 * CATEGORY_CHANGE_PLAN.md Session 3): opens a PayMongo page for an upgrade
 * waiting for its money and answers its URL, as `api/pay/[token]` does for an
 * unpaid order.
 *
 * **Public, so rate-limited** (`PAY_LINK_RULE`), and it trusts nothing but the
 * signed token. What PayMongo is asked to charge is read from the stored change:
 * its `amount`, plus the transaction fee on top for the method offered (D13),
 * computed here and written on the change in the same claim that stores the
 * page id, so the row says exactly what the page charges and the webhook
 * applies it with those figures.
 *
 * **One change, one payable page**, in the order `api/pay/[token]` keeps:
 *
 *  1. The change must still be payable (`changePayableState`). Anything else
 *     answers with its state, and the page reloads into the matching panel.
 *  2. **Was the last page paid?** If PayMongo says so, the change is settled
 *     here exactly as the webhook would settle it.
 *  3. **Close the last page** before opening a new one, so the runner can
 *     never pay twice. If it will not close, a payment may be under way.
 *  4. Open the new page and **claim it** only if the change still points at
 *     the page closed in step 3 and is still waiting; the loser of a race
 *     closes its own page and asks for a reload.
 *
 * The page carries the change's `changeRef` as its `reference_number`, so the
 * webhook finds the change by its stored id or by its reference either way.
 * Opening a page for a change first opened for GCash or bank turns it into an
 * online one; its hold is not moved.
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { PAY_LINK_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { transactionFeeFor } from '@/lib/free-checkout';
import { onlineChangeMethod } from '@/lib/category-change-hold';
import { payableStateOf, readChangeForPayment, settleChangeOnline } from '@/lib/category-change-payment';
import { lookUpPaymongoPayment } from '@/lib/online-payment';
import { openPaymongoPage, retirePaymongoPage } from '@/lib/paymongo-session';
import { readChangePaymentToken } from '@/lib/resume-payment';
import { eventOrigin } from '@/lib/site-host';

export async function POST(request: Request) {
  if (!allowRequest('change-pay-link', callerKey(request), PAY_LINK_RULE)) {
    return NextResponse.json(
      { error: 'Too many tries from this connection. Wait a minute, then press Pay now again.' },
      { status: 429 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    const changeId = token ? await readChangePaymentToken(token) : null;
    const change = changeId ? await readChangeForPayment(changeId) : null;
    if (!change) {
      return NextResponse.json({ state: 'invalid', error: 'This payment link is not valid any more.' }, { status: 404 });
    }

    const state = payableStateOf(change);
    if (state !== 'payable') {
      return NextResponse.json({ state, error: 'This change can no longer be paid here.' }, { status: 409 });
    }

    const method = onlineChangeMethod();
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!method || !secretKey || secretKey === 'sk_test_PLACEHOLDER_KEY') {
      console.error('Category change checkout: PayMongo is not set up');
      return NextResponse.json({ error: 'Online payment is not available right now. Please try again later.' }, { status: 503 });
    }

    const previous = change.checkoutSessionId;
    if (previous) {
      const lookup = await lookUpPaymongoPayment(previous);
      if ('paid' in lookup && lookup.paid) {
        await settleChangeOnline(change.id);
        return NextResponse.json({ state: 'applied' }, { status: 409 });
      }
      const retired = await retirePaymongoPage(secretKey, previous);
      if (!retired.ok) return NextResponse.json({ error: retired.error }, { status: 409 });
    }

    // D13: PayMongo's cut is the runner's, on top, exactly as at checkout.
    const transactionFee = transactionFeeFor(change.amount, method);
    const totalCharged = change.amount + transactionFee;
    const origin = eventOrigin(change.event, request.url);
    const back = `${origin}/pay/change/${token}`;
    const page = await openPaymongoPage(
      secretKey,
      {
        orderRef: change.changeRef,
        amountCents: totalCharged,
        paymentMethod: method,
        description: `Category change for ${change.event.title}`,
        customerName: `${change.runner.firstName} ${change.runner.lastName}`,
        customerEmail: change.runner.email,
        runners: [],
        subtotalCents: change.amount,
        discountAmount: 0,
        promoCode: null,
        deliveryFeeCents: 0,
        platformFeeCents: 0,
        transactionFeeCents: transactionFee,
        items: [{ name: `Category change: ${change.fromCategory.name} to ${change.toCategory.name}`, amount: change.amount }],
      },
      { successUrl: `${back}?paid=1`, cancelUrl: back },
    );
    if (!page.ok) {
      console.error('Category change checkout: PayMongo refused a page', page.error, page.details);
      return NextResponse.json(
        { error: 'PayMongo could not open a payment page just now. Wait a minute and try again.' },
        { status: 502 },
      );
    }

    const claim = await db.categoryChange.updateMany({
      where: { id: change.id, status: 'AWAITING_PAYMENT', checkoutSessionId: previous },
      data: { checkoutSessionId: page.id, paymentMethod: method, transactionFee, totalCharged },
    });
    if (claim.count === 0) {
      await retirePaymongoPage(secretKey, page.id);
      return NextResponse.json(
        { error: 'This change moved while its payment page was opening. Reload this page and try again.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ checkout_url: page.checkoutUrl });
  } catch (error) {
    console.error('Category change checkout failed:', error);
    return NextResponse.json({ error: 'Something went wrong opening the payment page. Try again.' }, { status: 500 });
  }
}
