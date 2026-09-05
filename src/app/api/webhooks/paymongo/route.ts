import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import crypto from 'crypto';
import { sendRegistrationConfirmationEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('paymongo-signature');

    // PayMongo webhook secret logic (Optional but recommended in production)
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (webhookSecret && signatureHeader) {
      // Verify signature
      // Signature header format: t=1611234567,te=signature_hash,li=test_signature_hash
      const timestampMatch = signatureHeader.match(/t=([^,]+)/);
      const signatureMatch = signatureHeader.match(/te=([^,]+)/) || signatureHeader.match(/li=([^,]+)/);

      if (timestampMatch && signatureMatch) {
        const timestamp = timestampMatch[1];
        const signature = signatureMatch[1];

        const signaturePayload = `${timestamp}.${rawBody}`;
        const computedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(signaturePayload)
          .digest('hex');

        if (computedSignature !== signature) {
          console.error('PayMongo Webhook signature verification failed');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
        }
      }
    }

    const body = JSON.parse(rawBody);
    const event = body.data;

    if (!event || !event.type) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // We listen to successful payment events
    // For e-wallet / payment intent: "payment.paid"
    // For checkout sessions (links): "checkout_session.payment.paid"
    if (event.type === 'payment.paid' || event.type === 'checkout_session.payment.paid') {
      let referenceNumber = '';
      let paymentIntentId = '';

      if (event.type === 'checkout_session.payment.paid') {
        const attributes = event.attributes.data.attributes;
        referenceNumber = attributes.reference_number;
        // In this case, the data.id is the checkout_session id (cs_...)
        // which matches what we saved in checkoutSessionId
        paymentIntentId = event.attributes.data.id || '';
      } else if (event.type === 'payment.paid') {
        const attributes = event.attributes;
        referenceNumber = attributes.description; // Depending on how we mapped it
        paymentIntentId = event.attributes.data?.id || '';
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
        // Update the registration status to PAID
        await prisma.registration.update({
          where: { id: registration.id },
          data: { status: 'PAID' }
        });

        console.log(`Successfully updated registration ${registration.orderRef} to PAID`);

        const full = await prisma.registration.findUnique({
          where: { id: registration.id },
          include: { event: true, runners: { include: { category: true } } },
        });
        if (full) await sendRegistrationConfirmationEmail(full);
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
