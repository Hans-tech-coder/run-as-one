import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import crypto from 'crypto';

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
      deliveryAddress,
      subtotal,
      deliveryFee,
      platformFee,
      transactionFee,
      paymentMethod
    } = body;

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey || secretKey === 'sk_test_PLACEHOLDER_KEY') {
      return NextResponse.json(
        { error: 'PayMongo Secret Key is missing or invalid. Please update .env.local' },
        { status: 500 }
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
        deliveryAddress,
        deliveryFee,
        subtotal,
        platformFee,
        transactionFee,
        totalAmount: amount,
        paymentMethod: paymentMethod,
        status: 'PENDING', // All payments start as PENDING until verified by webhook or admin
        runners: {
          create: participants.map((p: any) => ({
            categoryId: p.categoryId,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone,
            gender: p.gender,
            birthdate: p.birthdate,
            singletSize: p.singletSize,
            emergencyContactName: p.emergencyContactName,
            emergencyContactPhone: p.emergencyContactPhone,
            medicalConditions: p.medicalConditions,
          }))
        }
      }
    });

    const finalSuccessUrl = successUrl.includes('?') ? `${successUrl}&orderRef=${orderRef}` : `${successUrl}?orderRef=${orderRef}`;
    const finalCancelUrl = cancelUrl.includes('?') ? `${cancelUrl}&orderRef=${orderRef}&cancel=true` : `${cancelUrl}?orderRef=${orderRef}&cancel=true`;

    if (paymentMethod === 'bank_transfer') {
      return NextResponse.json({
        checkout_url: finalSuccessUrl
      });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { categories: true }
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const lineItems: any[] = [];
    
    // Add runners
    participants.forEach((p: any, index: number) => {
      const category = event.categories.find((c: any) => c.id === p.categoryId);
      if (category) {
        lineItems.push({
          currency: 'PHP',
          amount: Math.round(category.price * 100),
          name: `Runner ${index + 1} (${category.name})`,
          quantity: 1
        });
      }
    });

    // Add Delivery Fee if any
    if (deliveryFee > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: Math.round(deliveryFee * 100),
        name: 'Delivery Fee',
        quantity: 1
      });
    }

    // Add Admin/Platform Fee
    if (platformFee > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: Math.round(platformFee * 100),
        name: 'Admin Fee',
        quantity: 1
      });
    }

    // Add Transaction Fee
    if (transactionFee > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: Math.round(transactionFee * 100),
        name: 'Transaction Fee',
        quantity: 1
      });
    }

    // Fallback if lineItems is empty somehow (shouldn't happen)
    if (lineItems.length === 0) {
      lineItems.push({
        currency: 'PHP',
        amount: Math.round(amount * 100),
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
              amount: Math.round(amount * 100),
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
