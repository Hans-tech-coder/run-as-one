import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { recordWriteInCommunities, runnerCommunity } from '@/lib/running-community-store';
import crypto from 'crypto';
import { asDeliveryZone, deliveryFeeFor } from '@/app/events/[slug]/register/delivery';
import { storedShirtSize, subtotalWithUpcharge } from '@/lib/shirt-size';
import { hasFinished } from '@/lib/event-schedule';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      amount, 
      description, 
      successUrl, 
      cancelUrl, 
      customerEmail, 
      customerName, 
      eventId,
      participants,
      logisticsMethod,
      deliveryZone,
      deliveryAddress,
      subtotal,
      deliveryFee,
      platformFee,
      transactionFee,
      paymentMethod,
      consentGiven
    } = body;

    // The wizard already disables its submit button without this, but the
    // waiver is a legal gate, not a data-completeness one — an unauthorized
    // request that skips the UI must not be able to skip it either.
    if (consentGiven !== true) {
      return NextResponse.json(
        { error: 'Please agree to the Disclaimer, Consent & Data Privacy Waiver to continue.' },
        { status: 400 }
      );
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey || secretKey === 'sk_test_PLACEHOLDER_KEY') {
      return NextResponse.json(
        { error: 'PayMongo Secret Key is missing or invalid. Please update .env.local' },
        { status: 500 }
      );
    }

    // Amounts arrive as centavos. Round defensively — Prisma rejects a
    // non-integer for an Int column, and a stray decimal here would 500.
    const cents = (v: unknown) => Math.round(Number(v) || 0);
    const amountCents = cents(amount);
    const subtotalCents = cents(subtotal);
    const deliveryFeeCents = cents(deliveryFee);
    const platformFeeCents = cents(platformFee);
    const transactionFeeCents = cents(transactionFee);

    // Fetched before anything is written, because the line items below are
    // billed from these numbers — a payload that disagrees with the organizer's
    // prices must not reach PayMongo, let alone leave a registration behind.
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { categories: true }
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // The event page stops offering registration once a race has been run, but
    // a tab left open the day before would still post here. Taking money for a
    // race that is over is not something the UI alone should be trusted to
    // prevent.
    if (hasFinished(event)) {
      return NextResponse.json(
        { error: 'This race has already been held, so registration is closed.' },
        { status: 409 }
      );
    }

    // The client sends both the zone and the fee. They are two ways of saying
    // the same thing, so the organizer's prices decide which pairs are legal —
    // otherwise a registration could record "outside province" while paying the
    // inside rate. Same for the admin fee, which is now per event.
    const zone = logisticsMethod === 'delivery' ? asDeliveryZone(deliveryZone) : null;
    const expectedDeliveryFee = deliveryFeeFor(event, zone);
    const expectedPlatformFee = event.adminFee * participants.length;
    // Category prices plus the large-size surcharge. Checked rather than
    // trusted: without this, a client could post a subtotal that leaves out the
    // 4XL surcharge and pay the smaller amount.
    const expectedSubtotal = subtotalWithUpcharge(
      participants,
      event.categories,
      event.shirtSizeUpcharge
    );

    if (
      deliveryFeeCents !== expectedDeliveryFee ||
      platformFeeCents !== expectedPlatformFee ||
      subtotalCents !== expectedSubtotal
    ) {
      return NextResponse.json(
        { error: 'Prices have changed. Please reload the page and try again.' },
        { status: 409 }
      );
    }

    const orderRef = `RM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Temporarily save to DB as PAID to populate dashboard immediately
    const registration = await prisma.registration.create({
      data: {
        eventId,
        orderRef,
        customerEmail,
        customerName,
        logisticsMethod,
        // Only meaningful for delivery; pickup leaves it null.
        deliveryZone: zone,
        deliveryAddress,
        deliveryFee: deliveryFeeCents,
        subtotal: subtotalCents,
        platformFee: platformFeeCents,
        transactionFee: transactionFeeCents,
        totalAmount: amountCents,
        paymentMethod: paymentMethod,
        status: 'PENDING', // All payments start as PENDING until verified by webhook or admin
        // Checked above; recorded here as the organizer's evidence that the
        // waiver was agreed to at the moment of this specific submission.
        consentGiven: true,
        consentGivenAt: new Date(),
        runners: {
          create: participants.map((p: any) => ({
            categoryId: p.categoryId,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone,
            gender: p.gender,
            birthdate: p.birthdate,
            singletSize: storedShirtSize(p, event.categories),
            emergencyContactName: p.emergencyContactName,
            emergencyContactPhone: p.emergencyContactPhone,
            medicalConditions: p.medicalConditions,
            // Blank answers land on INDEPENDENT RUNNER; the field is optional.
            runningCommunity: runnerCommunity(p),
          }))
        }
      }
    });

    // Clubs nobody has approved yet go to the super admin's queue. This is
    // the only way a row enters that queue, so the list cannot be written to
    // by anyone who has not actually registered.
    await recordWriteInCommunities(participants);

    const finalSuccessUrl = successUrl.includes('?') ? `${successUrl}&orderRef=${orderRef}` : `${successUrl}?orderRef=${orderRef}`;
    const finalCancelUrl = cancelUrl.includes('?') ? `${cancelUrl}&orderRef=${orderRef}&cancel=true` : `${cancelUrl}?orderRef=${orderRef}&cancel=true`;

    if (paymentMethod === 'bank_transfer') {
      return NextResponse.json({
        checkout_url: finalSuccessUrl
      });
    }

    // Every amount below is already in centavos, which is also the unit
    // PayMongo expects — so no conversion happens here.
    const lineItems: any[] = [];

    // Add runners
    participants.forEach((p: any, index: number) => {
      const category = event.categories.find((c: any) => c.id === p.categoryId);
      if (category) {
        lineItems.push({
          currency: 'PHP',
          amount: category.price,
          name: `Runner ${index + 1} (${category.name})`,
          quantity: 1
        });
      }
    });

    // Add Delivery Fee if any
    if (deliveryFeeCents > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: deliveryFeeCents,
        name: 'Delivery Fee',
        quantity: 1
      });
    }

    // Add Admin/Platform Fee
    if (platformFeeCents > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: platformFeeCents,
        name: 'Admin Fee',
        quantity: 1
      });
    }

    // Add Transaction Fee
    if (transactionFeeCents > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: transactionFeeCents,
        name: 'Transaction Fee',
        quantity: 1
      });
    }

    // Fallback if lineItems is empty somehow (shouldn't happen)
    if (lineItems.length === 0) {
      lineItems.push({
        currency: 'PHP',
        amount: amountCents,
        name: 'Registration Fee',
        quantity: 1
      });
    }

    // Branch logic: Use Payment Intents API for direct e-wallets redirect, otherwise use Checkout Session
    if (paymentMethod === 'gcash' || paymentMethod === 'paymaya') {
      const auth = `Basic ${Buffer.from(secretKey).toString('base64')}`;

      // 1. Create Payment Intent
      const piRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: amountCents,
              payment_method_allowed: [paymentMethod],
              currency: 'PHP',
              description: description
            }
          }
        })
      });
      const piData = await piRes.json();
      if (!piRes.ok) {
        return NextResponse.json({ error: 'Failed to create payment intent', details: piData }, { status: piRes.status });
      }
      const piId = piData.data.id;

      // 2. Create Payment Method
      const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth
        },
        body: JSON.stringify({
          data: {
            attributes: {
              type: paymentMethod,
              billing: {
                name: customerName,
                email: customerEmail
              }
            }
          }
        })
      });
      const pmData = await pmRes.json();
      if (!pmRes.ok) {
        return NextResponse.json({ error: 'Failed to create payment method', details: pmData }, { status: pmRes.status });
      }
      const pmId = pmData.data.id;

      // 3. Attach Payment Method to Payment Intent
      const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${piId}/attach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth
        },
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: pmId,
              return_url: finalSuccessUrl
            }
          }
        })
      });
      const attachData = await attachRes.json();
      if (!attachRes.ok) {
        return NextResponse.json({ error: 'Failed to attach payment method', details: attachData }, { status: attachRes.status });
      }

      const redirectUrl = attachData.data?.attributes?.next_action?.redirect?.url;
      if (!redirectUrl) {
        return NextResponse.json({ error: 'Failed to get redirect URL from PayMongo', details: attachData }, { status: 500 });
      }

      // Update registration with intent ID instead of checkout session
      await prisma.registration.update({
        where: { id: registration.id },
        data: { checkoutSessionId: piId } // Repurposing field for tracking
      });

      return NextResponse.json({
        checkout_url: redirectUrl
      });
    }

    // Default to Checkout Session for card and qrph
    const options = {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(secretKey).toString('base64')}`
      },
      body: JSON.stringify({
        data: {
          attributes: {
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            description: description,
            reference_number: orderRef,
            line_items: lineItems,
            payment_method_types: [
              paymentMethod
            ],
            success_url: finalSuccessUrl,
            cancel_url: finalCancelUrl,
            customer_email: customerEmail,
            billing: {
              name: customerName,
              email: customerEmail
            }
          }
        }
      })
    };

    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', options);
    const data = await response.json();

    if (!response.ok) {
      console.error('PayMongo API Error:', data);
      return NextResponse.json(
        { error: 'Failed to create checkout session', details: data },
        { status: response.status }
      );
    }

    // Update registration with checkout session ID
    await prisma.registration.update({
      where: { id: registration.id },
      data: { checkoutSessionId: data.data.id }
    });

    return NextResponse.json({
      checkout_url: data.data.attributes.checkout_url
    });

  } catch (error: any) {
    console.error('Checkout Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
