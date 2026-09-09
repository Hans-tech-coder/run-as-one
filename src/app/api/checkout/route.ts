import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { newOrderRef } from '@/lib/order-ref';
import { recordWriteInCommunities, runnerCommunity } from '@/lib/running-community-store';
import { asDeliveryZone, deliveryFeeFor } from '@/app/events/[slug]/register/delivery';
import {
  LOGISTICS_METHODS,
  PAYMENT_METHODS,
  asLogisticsMethod,
  asPaymentMethod,
  paymongoPaymentType,
} from '@/lib/registration-codes';
import {
  runnerCategories,
  runnerPrices,
  storedShirtSize,
  subtotalWithUpcharge,
} from '@/lib/shirt-size';
import { hasFinished } from '@/lib/event-schedule';
import {
  SlotsUnavailableError,
  pauseNote,
  reserveSlots,
} from '@/lib/registration-gate';
import { deliverReceivedEmail } from '@/lib/email-delivery';
import {
  optionalUpperCaseForStorage,
  upperCaseForStorage,
} from '@/lib/text-case';
import { consentSignatureError } from '@/lib/consent-signature';
import {
  PromoUnavailableError,
  categorySeatsClaimed,
  redeemPromoCode,
} from '@/lib/discount';
import { resolveDiscount } from '@/lib/promo-store';

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
      consentGiven,
      consentSignature,
      promoCode
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

    // The signature is the other half of that gate, and it is checked here for
    // the same reason: a tick can be posted by anything, while a name someone
    // typed is a person putting themselves on the record. Only its presence is
    // required — see lib/consent-signature.ts, which both wizards share.
    // Uppercased first so the check runs on the value that will be stored.
    const storedConsentSignature = upperCaseForStorage(consentSignature);
    const signatureProblem = consentSignatureError(storedConsentSignature);
    if (signatureProblem) {
      return NextResponse.json({ error: signatureProblem }, { status: 400 });
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

    // The organizer's manual hold. Same reasoning as the finished check and
    // the consent gate: the event page and the wizard both stop offering
    // registration, and neither of them is the last word — a tab opened before
    // the hold went on will still post. The runner gets the organizer's own
    // wording, not a bare refusal.
    if (event.registrationPaused) {
      return NextResponse.json({ error: pauseNote(event) }, { status: 409 });
    }

    // The client sends both the zone and the fee. They are two ways of saying
    // the same thing, so the organizer's prices decide which pairs are legal —
    // otherwise a registration could record "outside province" while paying the
    // inside rate. Same for the admin fee, which is now per event.
    // Both codes go into the database uppercase, like every other coded
    // column (lib/registration-codes.ts), and through their guards rather than
    // straight off the request: a stale tab still posts the old lowercase
    // spelling, and it has to keep pricing correctly.
    const storedLogisticsMethod = asLogisticsMethod(logisticsMethod);
    const storedPaymentMethod = asPaymentMethod(paymentMethod);
    const zone =
      storedLogisticsMethod === LOGISTICS_METHODS.DELIVERY
        ? asDeliveryZone(deliveryZone)
        : null;
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

    // The discount is recomputed from the PromoCode row, never read off the
    // request — the same rule the subtotal and the fees above already live
    // under. A code that expired, filled up or stopped applying since the
    // wizard priced it is refused here with the sentence the wizard itself
    // would have shown, because the two run the same check.
    // Named rather than inline because the write below needs the same basis:
    // the seats a repricing promotion claims have to come from the walk that
    // priced the order, not from a second one built slightly differently.
    const promoOrder = {
      runnerPrices: runnerPrices(participants, event.categories, event.shirtSizeUpcharge),
      runnerCategories: runnerCategories(participants, event.categories),
      subtotal: expectedSubtotal,
    };
    const discount = await resolveDiscount(event, promoCode, promoOrder);
    if (discount.error) {
      return NextResponse.json({ error: discount.error }, { status: 400 });
    }
    const discountAmount = discount.applied?.amount ?? 0;

    // The one amount that was never checked before, and it has to be now: with
    // a discount in play, an order that under-reports it would be billed more
    // than the summary promised and one that over-reports it would be billed
    // less. The transaction fee is still the client's own figure — PayMongo's
    // rate table lives in the wizard — so this pins the total against it
    // rather than re-deriving it.
    const expectedTotal =
      expectedSubtotal +
      expectedDeliveryFee +
      expectedPlatformFee +
      transactionFeeCents -
      discountAmount;
    if (amountCents !== expectedTotal) {
      return NextResponse.json(
        { error: 'Prices have changed. Please reload the page and try again.' },
        { status: 409 }
      );
    }

    // Registrant text is stored uppercase (lib/text-case.ts). The wizard
    // already uppercases as the runner types, but this request did not have to
    // come from the wizard — a tab left open can POST straight here — so the
    // server is the one that decides what the column holds. The email address
    // is deliberately not in this list.
    const storedCustomerName = upperCaseForStorage(customerName);
    const storedDeliveryAddress = optionalUpperCaseForStorage(deliveryAddress);

    const orderRef = newOrderRef();

    // Slot limits are checked inside the write, not before it: a count taken
    // before the create is a count two simultaneous orders can both pass. See
    // reserveSlots, which locks the capped options first.
    const registration = await prisma.$transaction(async (tx) => {
      await reserveSlots(tx, event.categories, participants);

      // Spent when the order is placed, not when it is paid — the same moment
      // a slot is taken, and for the same reason: a voucher that only counted
      // on payment could be attached to any number of pending orders at once.
      if (discount.promo && discountAmount > 0) {
        await redeemPromoCode(
          tx,
          discount.promo.id,
          discount.promo.code,
          // The seats at the promotion price this order claims, from the same
          // walk that priced it — so the seats spent and the money taken off
          // can never describe different orders.
          categorySeatsClaimed(discount.promo, promoOrder),
        );
      }

      return tx.registration.create({
        data: {
          eventId,
          orderRef,
          customerEmail,
          customerName: storedCustomerName,
          logisticsMethod: storedLogisticsMethod,
          // Only meaningful for delivery; pickup leaves it null.
          deliveryZone: zone,
          deliveryAddress: storedDeliveryAddress,
          deliveryFee: deliveryFeeCents,
          subtotal: subtotalCents,
          platformFee: platformFeeCents,
          transactionFee: transactionFeeCents,
          totalAmount: amountCents,
          // What the code took off and which code it was, snapshotted onto the
          // order: the PromoCode row can be edited or deleted, and a receipt
          // has to keep saying what this runner was actually charged.
          discountAmount,
          promoCode: discountAmount > 0 ? discount.applied?.code ?? null : null,
          // Snapshotted beside the code, and for the same reason: the receipt
          // is rendered from this row long after the PromoCode it came from
          // may have been edited or deleted, and it has to know whether the
          // discount was a price the goods were sold at or a deduction from
          // them. See isPricedIn in lib/discount.ts.
          discountType: discountAmount > 0 ? discount.applied?.type ?? null : null,
          paymentMethod: storedPaymentMethod,
          status: 'PENDING', // All payments start as PENDING until verified by webhook or admin
          // Checked above; recorded here as the organizer's evidence that the
          // waiver was agreed to at the moment of this specific submission.
          consentGiven: true,
          consentGivenAt: new Date(),
          // Already uppercase by the time it is checked, and stored that way
          // like every other registrant field.
          consentSignature: storedConsentSignature,
          runners: {
            create: participants.map((p: any, index: number) => ({
              // 1..n, in the order the wizard collected them. This is the tail
              // of the reference this runner quotes back at us — see
              // lib/order-ref.ts — so it is written now and never recomputed.
              runnerNo: index + 1,
              categoryId: p.categoryId,
              firstName: upperCaseForStorage(p.firstName),
              lastName: upperCaseForStorage(p.lastName),
              // Not uppercased: the local part of an address is case-sensitive
              // on some mail servers, so touching it can stop delivery.
              email: p.email,
              phone: p.phone,
              gender: upperCaseForStorage(p.gender),
              birthdate: p.birthdate,
              singletSize: storedShirtSize(p, event.categories),
              // The promotion price this runner got a seat at, or null. A
              // snapshot for the same reason promoCode is, and the thing the
              // expiry sweep counts to hand back exactly the seats this order
              // took — see lib/pending-expiry.ts.
              promoPrice: discount.applied?.salePriceByRunner[index] ?? null,
              emergencyContactName: upperCaseForStorage(p.emergencyContactName),
              emergencyContactPhone: p.emergencyContactPhone,
              medicalConditions: optionalUpperCaseForStorage(p.medicalConditions),
              // Blank answers land on INDEPENDENT RUNNER; the field is optional.
              runningCommunity: runnerCommunity(p),
            }))
          }
        },
        include: { event: true, runners: { include: { category: true } } },
      });
    });

    // Clubs nobody has approved yet go to the super admin's queue. This is
    // the only way a row enters that queue, so the list cannot be written to
    // by anyone who has not actually registered.
    await recordWriteInCommunities(participants);

    // Sent now, not after payment: the runner should see their submitted
    // details are correct before they've even reached PayMongo's page. The
    // actual receipt only goes out once the webhook confirms PAID. Whether the
    // send actually happened is written onto the registration, since on
    // Resend's free tier it may simply not have — see lib/email-delivery.ts.
    await deliverReceivedEmail(registration);

    const finalSuccessUrl = successUrl.includes('?') ? `${successUrl}&orderRef=${orderRef}` : `${successUrl}?orderRef=${orderRef}`;
    const finalCancelUrl = cancelUrl.includes('?') ? `${cancelUrl}&orderRef=${orderRef}&cancel=true` : `${cancelUrl}?orderRef=${orderRef}&cancel=true`;

    if (storedPaymentMethod === PAYMENT_METHODS.BANK_TRANSFER) {
      return NextResponse.json({
        checkout_url: finalSuccessUrl
      });
    }

    // Every amount below is already in centavos, which is also the unit
    // PayMongo expects — so no conversion happens here.
    const lineItems: any[] = [];

    // Add runners.
    //
    // A discounted order is billed as one collapsed goods line instead.
    // PayMongo totals a checkout session from its line items and will not take
    // a negative one, so a discount cannot be shown as its own subtracted row
    // — and per-runner prices that still added up to the full subtotal would
    // charge the runner more than the summary promised. The itemisation the
    // runner needs is in the wizard's summary and in both emails; what this
    // list has to be is exactly the amount being charged.
    if (discountAmount > 0) {
      // A code that covers the goods entirely leaves nothing to bill for them,
      // and PayMongo rejects a zero-amount line — the fees below are then the
      // whole charge.
      const goodsAfterDiscount = expectedSubtotal - discountAmount;
      if (goodsAfterDiscount > 0) {
        lineItems.push({
          currency: 'PHP',
          amount: goodsAfterDiscount,
          name: `Registration — ${participants.length} runner${participants.length === 1 ? '' : 's'} (${discount.applied?.code} applied)`,
          quantity: 1
        });
      }
    } else {
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
    }

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
    if (storedPaymentMethod === 'GCASH' || storedPaymentMethod === 'PAYMAYA') {
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
              payment_method_allowed: [paymongoPaymentType(storedPaymentMethod)],
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
              type: paymongoPaymentType(storedPaymentMethod),
              billing: {
                name: storedCustomerName,
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
              paymongoPaymentType(storedPaymentMethod)
            ],
            success_url: finalSuccessUrl,
            cancel_url: finalCancelUrl,
            customer_email: customerEmail,
            billing: {
              name: storedCustomerName,
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
    // The order no longer fits — which option and by how much is already in
    // the message, so it goes back as it is rather than as a generic failure.
    if (error instanceof SlotsUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // Somebody else took the last redemption between the summary being drawn
    // and this write landing. Same shape as a slot shortfall: the message
    // already says what to do, so it goes back as it is.
    if (error instanceof PromoUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Checkout Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
