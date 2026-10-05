import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import crypto from 'crypto';
import { settleOnlinePayment } from '@/lib/online-payment';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('paymongo-signature');

    // PayMongo webhook secret logic (Optional but recommended in production)
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (webhookSecret) {
      // Header format: t=<timestamp>,te=<test-mode sig>,li=<live-mode sig>.
      // Only the current mode's slot is filled. A request that is unsigned or
      // unparseable is rejected — otherwise anyone could mark an order PAID.
      const timestampMatch = signatureHeader?.match(/t=([^,]+)/);
      const signatureMatch = signatureHeader?.match(/te=([^,]+)/) || signatureHeader?.match(/li=([^,]+)/);

      if (!timestampMatch || !signatureMatch) {
        console.error('PayMongo Webhook: missing or malformed signature header');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }

      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestampMatch[1]}.${rawBody}`)
        .digest('hex');

      if (computedSignature !== signatureMatch[1]) {
        console.error('PayMongo Webhook signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    }

    // Envelope: { data: { type: 'event', attributes: { type: '<event name>', data: <resource> } } }.
    // `data.type` is always "event"; the event name is one level down.
    const body = JSON.parse(rawBody);
    const eventType: string | undefined = body.data?.attributes?.type;
    const resource = body.data?.attributes?.data;

    if (!eventType || !resource) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Card / QRPh go through a Checkout Session (we store its cs_ id);
    // GCash / Maya go through a Payment Intent (we store its pi_ id).
    if (eventType === 'payment.paid' || eventType === 'checkout_session.payment.paid') {
      let referenceNumber = '';
      let paymentIntentId = '';

      if (eventType === 'checkout_session.payment.paid') {
        referenceNumber = resource.attributes?.reference_number || '';
        paymentIntentId = resource.id || '';
      } else {
        // A card payment also fires payment.paid, carrying the session's
        // internal pi_ — it matches nothing and is ignored, which is fine.
        paymentIntentId = resource.attributes?.payment_intent_id || '';
      }

      // Try to find the registration by checkoutSessionId (which we used for piId) OR orderRef
      let registration = null;

      if (paymentIntentId) {
        registration = await prisma.registration.findFirst({
          where: { checkoutSessionId: paymentIntentId }
        });
      }

      if (!registration && referenceNumber) {
        registration = await prisma.registration.findFirst({
          where: { orderRef: referenceNumber }
        });
      }

      if (registration) {
        // The same path the admin's "Check with PayMongo" takes
        // (lib/online-payment.ts): only a PENDING order flips, and the receipt
        // goes out on the flip alone. A retried delivery finds it PAID and
        // does nothing. Every outcome is answered 200 so PayMongo stops
        // retrying.
        const settled = await settleOnlinePayment(registration.id);
        if (settled.outcome === 'marked_paid') {
          console.log(`Successfully updated registration ${registration.orderRef} to PAID`);
        } else if (settled.outcome === 'not_pending') {
          console.error(
            `PayMongo Webhook: payment for ${registration.orderRef} arrived while it was ${settled.status}; not marked PAID — needs a manual reinstate or refund`
          );
        }
      } else {
        console.warn(`PayMongo Webhook: Registration not found for reference ${referenceNumber} or PI ${paymentIntentId}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PayMongo Webhook Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
