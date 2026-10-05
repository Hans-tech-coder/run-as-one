import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { newOrderRef } from '@/lib/order-ref';
import { recordWriteInCommunities, runnerCommunity } from '@/lib/running-community-store';
import { checkoutDelivery } from '@/app/events/[slug]/register/delivery-split';
import {
  PAYMENT_METHODS,
  asLogisticsMethod,
  asPaymentMethod,
  paymentMethodLabel,
} from '@/lib/registration-codes';
import {
  runnerCategories,
  runnerPrices,
  storedShirtSize,
  subtotalWithUpcharge,
} from '@/lib/shirt-size';
import { hasFinished } from '@/lib/event-schedule';
import {
  participantBirthdateError,
  participantGuardianError,
  storedGuardianConsent,
} from '@/lib/minor-consent';
import {
  SlotsUnavailableError,
  openingNote,
  opensLater,
  participantCategoryError,
  pauseNote,
  reserveSlots,
} from '@/lib/registration-gate';
import { deliverConfirmationEmail, deliverReceivedEmail } from '@/lib/email-delivery';
import { discardFailedCheckout } from '@/lib/pending-expiry';
import {
  FREE_ORDER_COLUMNS,
  chargeableTotal,
  isFreeOrder,
  OFFERED_PAYMONGO_METHODS,
  isPayMongoMethod,
  platformFeeAfterDiscount,
  transactionFeeFor,
} from '@/lib/free-checkout';
import {
  optionalUpperCaseForStorage,
  upperCaseForStorage,
} from '@/lib/text-case';
import { consentSignatureError } from '@/lib/consent-signature';
import { participantAddressError, storedRunnerAddress } from '@/lib/runner-address';
import {
  emailAddressError,
  normalizeEmailAddress,
  participantEmailError,
} from '@/lib/email-address';
import {
  PromoUnavailableError,
  categorySeatsClaimed,
  redeemPromoCode,
  runnersDiscounted,
} from '@/lib/discount';
import { resolveDiscount } from '@/lib/promo-store';
import { openPaymongoPage } from '@/lib/paymongo-session';

export async function POST(request: Request) {
  // Set once an online order is written and cleared once PayMongo accepts it.
  // Anything that ends the request while it is still set — a PayMongo
  // rejection or a thrown error — discards the order (discardFailedCheckout).
  let unconfirmedOnlineOrderId: string | null = null;
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
      deliverySplit,
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

    // Every email this order will ever produce goes to the address below: the
    // "registration received" mail sent a few lines down, the receipt when the
    // payment clears, and anything an organizer sends by hand later. An
    // address Resend refuses ("Invalid `to` field") makes all of that silent —
    // and by then the runner has paid, so there is no screen left to tell them
    // on. The wizards check the same rule as the runner types (see
    // lib/email-address.ts), and this is the door that does not depend on the
    // wizard having been the thing that posted.
    const emailProblem =
      participantEmailError(participants) ??
      emailAddressError(customerEmail, { blank: 'Enter an email address for this order' });
    if (emailProblem) {
      return NextResponse.json({ error: emailProblem }, { status: 400 });
    }

    // A birthdate from the future is refused here as well as in the wizard, so
    // a direct POST cannot store one. See lib/minor-consent.ts.
    const birthdateProblem = participantBirthdateError(participants);
    if (birthdateProblem) {
      return NextResponse.json({ error: birthdateProblem }, { status: 400 });
    }

    // Trimmed, never cased: a space pasted in from a contact card is enough to
    // stop the send on its own, while the local part of an address is
    // case-sensitive on some mail servers.
    const storedCustomerEmail = normalizeEmailAddress(customerEmail);

    // Read now, checked further down: an order that turns out to cost nothing
    // never reaches PayMongo, so it must not be refused for a key it will not
    // use. The check stays *before* the write, so a misconfigured key still
    // fails without leaving an unpayable registration behind.
    const secretKey = process.env.PAYMONGO_SECRET_KEY;

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

    // Every runner must be entered into one of this event's own options: one
    // from another event would be priced at ₱0 and skip the slot caps (see
    // participantCategoryError in lib/registration-gate.ts).
    const categoryProblem = participantCategoryError(participants, event.categories);
    if (categoryProblem) {
      return NextResponse.json({ error: categoryProblem }, { status: 400 });
    }

    // A runner 12 or under on race day needs a parent or guardian's name,
    // relationship and tick (lib/minor-consent.ts). Checked here as well as in
    // the wizard, and only now, because the age is taken on this event's date.
    const guardianProblem = participantGuardianError(participants, event.date);
    if (guardianProblem) {
      return NextResponse.json({ error: guardianProblem }, { status: 400 });
    }

    // Every runner's home address, pickup or delivery (lib/runner-address.ts).
    // The wizard posts each runner's resolved copy, "same as Runner 1"
    // included, so each one is checked and stored on its own row.
    const addressProblem = participantAddressError(participants);
    if (addressProblem) {
      return NextResponse.json({ error: addressProblem }, { status: 400 });
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

    // A race listed before it opens. Same reasoning again, with one addition
    // of its own: this hold lifts on a clock rather than on a decision, so the
    // gap between "the page said closed" and "the post arrived" is a gap a
    // runner sitting on the page waiting for the opening will actually be in.
    if (opensLater(event)) {
      return NextResponse.json({ error: openingNote(event) }, { status: 409 });
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
    // With the event's province set, the zone comes from the address the
    // runner gave, not from what the tab posted; a split delivery is priced
    // per distinct home address (delivery-split.ts).
    const delivery = checkoutDelivery(event, {
      logisticsMethod,
      deliveryZone,
      deliveryAddress,
      deliverySplit,
      participants,
    });
    if ('error' in delivery) {
      return NextResponse.json({ error: delivery.error }, { status: 400 });
    }
    const { zone, split } = delivery;
    const expectedDeliveryFee = delivery.fee;
    // Category prices plus the large-size surcharge. Checked rather than
    // trusted: without this, a client could post a subtotal that leaves out the
    // 4XL surcharge and pay the smaller amount.
    const expectedSubtotal = subtotalWithUpcharge(
      participants,
      event.categories,
      event.shirtSizeUpcharge
    );

    // The admin fee is checked a few lines below instead of here, because a
    // pacer code can waive it (lib/free-checkout.ts) and the code has to be
    // resolved before we know what the fee should be.
    if (
      deliveryFeeCents !== expectedDeliveryFee ||
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

    // The admin fee, with a pacer's waiver applied if the winning code carries
    // one. Recomputed from the row like every other amount here: a client that
    // posted a waived fee it had not earned would be handing itself Run As
    // One's commission.
    const expectedPlatformFee = platformFeeAfterDiscount(
      event.adminFee,
      participants.length,
      discount.applied,
    );
    if (platformFeeCents !== expectedPlatformFee) {
      return NextResponse.json(
        { error: 'Prices have changed. Please reload the page and try again.' },
        { status: 409 }
      );
    }

    // Whether there is anything left to collect — **the server's own answer**,
    // from figures it recomputed, never from the request. A free order skips
    // PayMongo entirely, so this is the one decision a posted `amount: 0` must
    // not be able to reach. See lib/free-checkout.ts.
    const chargeable = chargeableTotal({
      subtotal: expectedSubtotal,
      deliveryFee: expectedDeliveryFee,
      platformFee: expectedPlatformFee,
      discountAmount,
    });
    const free = isFreeOrder(chargeable);

    // Every amount is now the server's own. The transaction fee used to be the
    // client's figure, pinned only against the posted total — so a negative fee
    // with a matching lower total paid less than the goods cost (Strix
    // vuln-0014). It is recomputed here from the chargeable total and the
    // method (lib/free-checkout.ts), and a free order's is zero.
    //
    // From the *stored* method, and only for one PayMongo actually charges a
    // fee on: the raw value would price "gcash" or "PAYMAYA" at no fee while
    // PayMongo still took its cut from the organizer.
    if (
      !free &&
      storedPaymentMethod !== PAYMENT_METHODS.BANK_TRANSFER &&
      !isPayMongoMethod(storedPaymentMethod)
    ) {
      return NextResponse.json(
        {
          error: `Choose a payment method: ${[
            ...OFFERED_PAYMONGO_METHODS.map(paymentMethodLabel),
            'bank transfer',
          ].join(' or ')}.`,
        },
        { status: 400 }
      );
    }
    const expectedTransactionFee = transactionFeeFor(chargeable, storedPaymentMethod);
    const expectedTotal = chargeable + expectedTransactionFee;
    if (amountCents !== expectedTotal || transactionFeeCents !== expectedTransactionFee) {
      return NextResponse.json(
        { error: 'Prices have changed. Please reload the page and try again.' },
        { status: 409 }
      );
    }

    // Checked only now, and only for an order that will actually be charged:
    // still before the write, so a misconfigured key cannot leave an unpayable
    // registration behind, but no longer in the way of an order PayMongo will
    // never see.
    if (!free && (!secretKey || secretKey === 'sk_test_PLACEHOLDER_KEY')) {
      return NextResponse.json(
        { error: 'PayMongo Secret Key is missing or invalid. Please update .env.local' },
        { status: 500 }
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
            discount.promo.automatic,
            runnersDiscounted(discount.promo, promoOrder)
          );
      }

      return tx.registration.create({
        data: {
          eventId,
          orderRef,
          customerEmail: storedCustomerEmail,
          customerName: storedCustomerName,
          logisticsMethod: storedLogisticsMethod,
          // Only meaningful for delivery; pickup leaves it null.
          deliveryZone: zone,
          // Split orders ship to each runner's own row address instead.
          deliveryAddress: split ? null : storedDeliveryAddress,
          deliverySplit: split,
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
          // Nothing to collect, so nothing to wait for. Spread *after* the two
          // lines above so it has the last word: a free order is written PAID
          // and COMPLIMENTARY, with its three chargeable amounts forced to
          // zero rather than copied from a request that was only checked
          // against them. See lib/free-checkout.ts.
          ...(free ? FREE_ORDER_COLUMNS : {}),
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
              // Trimmed but never cased: the local part of an address is
              // case-sensitive on some mail servers, so touching it can stop
              // delivery, while a stray space stops it outright.
              email: normalizeEmailAddress(p.email),
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
              // Nulls for a runner who does not need consent, whatever the
              // client sent; the timestamp is always the server's.
              ...storedGuardianConsent(p, event.date),
              ...storedRunnerAddress(p),
            }))
          }
        },
        include: { event: true, runners: { include: { category: true } } },
      });
    });

    // Clubs nobody has approved yet go to the Communities review queue. This is
    // the only way a row enters that queue, so the list cannot be written to
    // by anyone who has not actually registered.
    await recordWriteInCommunities(participants);

    // Which email goes out now, if any. Whether a send actually happened is
    // written onto the registration, since on Resend's free tier it may simply
    // not have — see lib/email-delivery.ts.
    //
    //  - A free order is already PAID, so it gets the receipt: asking a pacer
    //    to wait for a payment that does not exist would be the one mail they
    //    cannot act on. See FREE_ORDER_EMAIL_NOTE in lib/free-checkout.ts.
    //  - A bank transfer gets the "received" email, since it will sit PENDING
    //    for days while an organizer checks the deposit slip.
    //  - An online payment gets nothing yet. It is not a registration until
    //    PayMongo confirms the money (owner's rule), so the webhook sends one
    //    receipt carrying every submitted detail — and a checkout that errors
    //    or is abandoned never emails the runner at all.
    if (free) {
      await deliverConfirmationEmail(registration);
    } else if (storedPaymentMethod === PAYMENT_METHODS.BANK_TRANSFER) {
      await deliverReceivedEmail(registration);
    } else {
      unconfirmedOnlineOrderId = registration.id;
    }

    const finalSuccessUrl = successUrl.includes('?') ? `${successUrl}&orderRef=${orderRef}` : `${successUrl}?orderRef=${orderRef}`;
    const finalCancelUrl = cancelUrl.includes('?') ? `${cancelUrl}&orderRef=${orderRef}&cancel=true` : `${cancelUrl}?orderRef=${orderRef}&cancel=true`;

    // **Never PayMongo.** There is nothing to charge, and a zero-amount
    // checkout session is rejected outright — so the runner goes straight to
    // the confirmation screen the paid path reaches after paying. Answered in
    // the same shape as every other branch here, so the wizard needs no second
    // way of reading a success.
    if (free) {
      return NextResponse.json({ checkout_url: finalSuccessUrl });
    }

    if (storedPaymentMethod === PAYMENT_METHODS.BANK_TRANSFER) {
      return NextResponse.json({
        checkout_url: finalSuccessUrl
      });
    }

    // Checked above, and a free order has already returned — so from here on
    // there is a key, and the PayMongo calls below can say so.
    const paymongoKey = secretKey as string;

    // The line items and the PayMongo calls live in lib/paymongo-session.ts,
    // shared with the resume-payment link, which rebuilds the same page from
    // the stored order. Everything handed over here is what was just checked.
    const page = await openPaymongoPage(
      paymongoKey,
      {
        orderRef,
        amountCents,
        paymentMethod: storedPaymentMethod,
        description,
        customerName: storedCustomerName,
        customerEmail: storedCustomerEmail,
        // Each at their own price, large-size upcharge included, so the line
        // items add up to the subtotal checked above.
        runners: participants.flatMap((p: any, index: number) => {
          const category = event.categories.find((c: any) => c.id === p.categoryId);
          return category ? [{ categoryName: category.name, price: promoOrder.runnerPrices[index] }] : [];
        }),
        subtotalCents: expectedSubtotal,
        discountAmount,
        promoCode: discount.applied?.code ?? null,
        deliveryFeeCents,
        platformFeeCents,
        transactionFeeCents,
      },
      { successUrl: finalSuccessUrl, cancelUrl: finalCancelUrl },
    );
    if (!page.ok) {
      return NextResponse.json({ error: page.error, details: page.details }, { status: page.status });
    }

    // A Checkout Session id for card and QRPh; a Payment Intent id for GCash
    // and Maya, repurposing the field for tracking.
    await prisma.registration.update({
      where: { id: registration.id },
      data: { checkoutSessionId: page.id }
    });

    unconfirmedOnlineOrderId = null;
    return NextResponse.json({
      checkout_url: page.checkoutUrl
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
  } finally {
    // Still set means PayMongo never accepted this order: one of its calls
    // was rejected or something threw. The runner saw an error, not a
    // payment page, so the order is removed and its slot and promo handed
    // back (lib/pending-expiry.ts discardFailedCheckout).
    if (unconfirmedOnlineOrderId) {
      try {
        await discardFailedCheckout(unconfirmedOnlineOrderId);
      } catch (discardError) {
        // Left PENDING, the daily expire-pending sweep still releases it.
        console.error('Checkout: could not discard failed order', discardError);
      }
    }
  }
}
