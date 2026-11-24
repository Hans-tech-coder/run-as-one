import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { newOrderRef } from '@/lib/order-ref';
import { recordWriteInCommunities } from '@/lib/running-community-store';
import { discardUnclaimedProof, uploadPrivateProof, UploadError } from '@/lib/blob';
import {
  asLogisticsMethod,
  PAYMENT_METHODS,
} from '@/lib/registration-codes';
import { SlotsUnavailableError } from '@/lib/registration-gate';
import { deliverConfirmationEmail, deliverReceivedEmail } from '@/lib/email-delivery';
import {
  optionalUpperCaseForStorage,
  upperCaseForStorage,
} from '@/lib/text-case';
import { PromoUnavailableError } from '@/lib/discount';
import { priceCheckout } from '@/lib/checkout-pricing';
import { ADD_ON_ORDER } from '@/lib/add-on-stock';
import { logHeldPrice } from '@/lib/price-lock';
import { priceChangedBody } from '@/lib/price-changed';
import { CHECKOUT_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { checkoutPaidTo, readManualCheckoutForm } from '@/lib/manual-checkout-form';
import { readTransactionNumber } from '@/lib/category-change-hold';
import {
  REFERENCE_IN_USE_RUNNER,
  ReferenceInUseError,
  isReferenceIndexViolation,
} from '@/lib/payment-reference';
import { RunnerAlreadyRegisteredError } from '@/lib/runner-match';
import { checkoutGateRefusal } from '@/lib/order-gates';
import { placeOrder } from '@/lib/place-order';

export async function POST(request: Request) {
  // Same window as /api/checkout ('checkout' bucket): both spend the same
  // slots, so alternating between them must not double a script's allowance.
  // Checked before the proof upload, so a refusal costs no blob write.
  if (!allowRequest('checkout', callerKey(request), CHECKOUT_RULE)) {
    return NextResponse.json(
      { error: 'Too many orders from this connection in a short time. Wait a minute, then try again.' },
      { status: 429 }
    );
  }

  // The slip this request uploaded, until an order points at it. Set after the
  // upload and cleared once the order is written, so the catch below can tell
  // a slip nothing references from one a saved order already does.
  let unclaimedProof: string | null = null;

  try {
    // A body that is not a form (JSON, empty, malformed) is a bad request from
    // the caller, not a server failure, so it is refused before anything else.
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Send the order as a form with the payment proof attached.' },
        { status: 400 }
      );
    }

    // The waiver, the signature, the order size, every email address and
    // every birthdate, checked before the event is read (lib/manual-checkout-form.ts).
    const read = readManualCheckoutForm(formData);
    if (read.refusal) {
      return NextResponse.json({ error: read.refusal.error }, { status: read.refusal.status });
    }
    const {
      proofFile,
      eventId,
      customerName,
      logisticsMethod,
      deliveryZone,
      deliveryAddress,
      subtotal,
      deliveryFee,
      platformFee,
      transactionFee,
      totalAmount,
      transactionNumber,
      paidTo,
      promoCode,
      priceLock,
      participants,
      storedConsentSignature,
      storedCustomerEmail,
    } = read.form;

    // The client sends both the zone and the fee. They are two ways of saying
    // the same thing, so the organizer's prices decide which pairs are legal —
    // otherwise a registration could record "outside province" while paying the
    // inside rate. Same for the admin fee, which is now per event.
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        categories: true,
        addOns: { orderBy: ADD_ON_ORDER },
        // Which of them the runner paid into (checkoutPaidTo, below).
        bankAccounts: { select: { bankName: true }, orderBy: { sortOrder: 'asc' } },
      }
    });
    // Published, not results-only, every runner's option, guardian and
    // address, and the race neither held, closed, paused nor yet to open —
    // the same checks in the same order as /api/checkout (lib/order-gates.ts).
    const gate = checkoutGateRefusal(event, participants);
    if (gate || !event) {
      return NextResponse.json(
        { error: gate?.error ?? 'Event not found' },
        { status: gate?.status ?? 404 }
      );
    }

    // The logistics code goes into the database uppercase, like every other coded
    // column (lib/registration-codes.ts), and through their guards rather than
    // straight off the request: a stale tab still posts the old lowercase
    // spelling, and it has to keep pricing correctly.
    const storedLogisticsMethod = asLogisticsMethod(logisticsMethod);
    // Always a bank transfer, whatever the form says: this route only takes
    // orders paid by deposit slip. A posted "GCASH" would otherwise write an
    // order the registrants list hides (listedRegistrationWhere) and the 24h
    // sweep expires despite its slip. A free order is rewritten COMPLIMENTARY
    // below by FREE_ORDER_COLUMNS.
    const storedPaymentMethod = PAYMENT_METHODS.BANK_TRANSFER;
    // Priced by the server, never the request: delivery, subtotal, discount,
    // platform fee and total, with the "Prices have changed" refusals for a
    // posted subtotal, delivery fee or admin fee that disagree
    // (lib/checkout-pricing.ts). A bank transfer's transaction fee is zero.
    const pricing = await priceCheckout(event, {
      participants,
      logisticsMethod,
      deliveryZone,
      deliveryAddress,
      promoCode,
      priceLock,
      paymentMethod: storedPaymentMethod,
      posted: { subtotal, deliveryFee, platformFee },
    });
    if (pricing.refusal) {
      return NextResponse.json(pricing.refusal.body, { status: pricing.refusal.status });
    }
    const {
      lockedAt,
      discount,
      discountAmount,
      free,
      total: expectedTotal,
      figures: serverFigures,
    } = pricing;

    // The total matters more here than on the online route: this runner has
    // already transferred the money and is uploading the slip, so the amount
    // written on the order is what an organizer will reconcile against their
    // bank statement. A bank transfer carries no transaction fee, so a posted
    // one is refused rather than trusted — a negative fee would otherwise pull
    // the total below what the goods cost (Strix vuln-0014).
    if (totalAmount !== expectedTotal || transactionFee !== 0) {
      return NextResponse.json(priceChangedBody(serverFigures), { status: 409 });
    }

    // The deposit slip, required for every order there is money behind. A free
    // order has none — there was no transfer — and demanding one would be
    // asking a pacer to photograph a payment they were told not to make.
    if (!free && !proofFile) {
      return NextResponse.json({ error: 'Proof of payment is required' }, { status: 400 });
    }

    // The reference the transfer was made under, trimmed and capped like every
    // other route that takes one (lib/category-change-hold.ts). A free order
    // keeps none. Whether another payment already holds it is checked inside
    // the write below (claimReference), under its own lock.
    let storedTransactionNumber: string | null = null;
    if (!free) {
      const { value, error } = readTransactionNumber(transactionNumber);
      if (error) {
        return NextResponse.json({ error, field: 'transactionNumber' }, { status: 400 });
      }
      storedTransactionNumber = value;
    }

    // The account the transfer went into, one of this event's own
    // (PAYMENT_CHANNELS_PLAN.md D2, lib/manual-checkout-form.ts). A free order
    // went into none.
    let storedPaidTo: string | null = null;
    if (!free) {
      const checked = checkoutPaidTo(paidTo, event.bankAccounts);
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error, field: 'paidTo' }, { status: 400 });
      }
      storedPaidTo = checked.value;
    }

    // 1. Store the receipt as a private blob. This route is public — anyone can
    // reach it — so uploadPrivateProof() enforces the type and size limits.
    // What we keep is the blob pathname; admins view it through
    // /api/admin/proof/[id], which signs a short-lived URL after checking auth.
    // A free order stores none: there is nothing it could be proof of, and a
    // file attached to one is ignored rather than kept.
    const proofPathname = free || !proofFile ? null : await uploadPrivateProof(proofFile);
    unclaimedProof = proofPathname;

    // Registrant text is stored uppercase (lib/text-case.ts). The wizard
    // already uppercases as the runner types, but this request did not have to
    // come from the wizard — a tab left open can POST straight here — so the
    // server is the one that decides what the column holds. The email address
    // is deliberately not in this list.
    const storedCustomerName = upperCaseForStorage(customerName);
    const storedDeliveryAddress = optionalUpperCaseForStorage(deliveryAddress);

    // 2. Generate Order Reference
    const orderRef = newOrderRef();

    // 3. Save to database: reference, event lock, duplicate runners, slots,
    // add-on stock and promos, then the row itself (lib/place-order.ts).
    const registration = await prisma.$transaction((tx) =>
      placeOrder(tx, {
        event,
        orderRef,
        participants,
        pricing,
        order: {
          customerEmail: storedCustomerEmail,
          customerName: storedCustomerName,
          logisticsMethod: storedLogisticsMethod,
          deliveryAddress: storedDeliveryAddress,
          deliveryFee,
          subtotal,
          platformFee,
          transactionFee,
          totalAmount,
          paymentMethod: storedPaymentMethod,
          consentSignature: storedConsentSignature,
        },
        payment: {
          transactionNumber: storedTransactionNumber,
          proofOfPayment: proofPathname,
          paidTo: storedPaidTo,
        },
      }),
    );
    // The order points at the slip now; nothing after this may delete it.
    unclaimedProof = null;

    if (lockedAt && discount.heldByLock) {
      logHeldPrice({
        eventId: event.id,
        orderRef,
        lockedAt,
        lockedAmount: discountAmount,
        nowAmount: discount.heldByLock.nowAmount,
      });
    }

    // Clubs nobody has approved yet go to the Communities review queue. This is
    // the only way a row enters that queue, so the list cannot be written to
    // by anyone who has not actually registered.
    await recordWriteInCommunities(participants);

    // Sent now, not the receipt: a bank transfer is unverified money until an
    // admin looks at the proof, so this only confirms the submission — the
    // receipt (deliverConfirmationEmail) waits for that admin action. Whether
    // the send actually happened is written onto the registration, since on
    // Resend's free tier it may simply not have — see lib/email-delivery.ts.
    //
    // A free order has no transfer to verify and is already PAID, so it gets
    // the receipt straight away. See FREE_ORDER_EMAIL_NOTE in
    // lib/free-checkout.ts.
    await (free ? deliverConfirmationEmail : deliverReceivedEmail)(registration);

    return NextResponse.json({
      success: true, 
      orderRef: registration.orderRef 
    });

  } catch (error: any) {
    await discardUnclaimedProof(unclaimedProof, 'Manual checkout');
    // A rejected file is the runner's mistake, not ours — tell them what to fix.
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
    // Another live payment already carries this reference. The runner is not
    // told whose (R5).
    if (error instanceof ReferenceInUseError) {
      return NextResponse.json(error.runnerBody(), { status: 409 });
    }
    // Names only the runner (M4): no order ref, no email.
    if (error instanceof RunnerAlreadyRegisteredError) {
      return NextResponse.json(error.runnerBody(), { status: 409 });
    }
    if (isReferenceIndexViolation(error)) {
      return NextResponse.json({ error: REFERENCE_IN_USE_RUNNER, field: 'transactionNumber' }, { status: 409 });
    }
    console.error('Manual Checkout Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
