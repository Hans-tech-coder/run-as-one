import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { newOrderRef } from '@/lib/order-ref';
import { recordWriteInCommunities, runnerCommunity } from '@/lib/running-community-store';
import { uploadPrivateProof, UploadError } from '@/lib/blob';
import { asDeliveryZone, deliveryFeeFor } from '@/app/events/[slug]/register/delivery';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  asPaymentMethod,
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
    const formData = await request.formData();
    
    const proofFile = formData.get('proofFile') as File | null;
    const eventId = formData.get('eventId') as string;
    const customerEmail = formData.get('customerEmail') as string;
    const customerName = formData.get('customerName') as string;
    const logisticsMethod = formData.get('logisticsMethod') as string;
    const deliveryZone = formData.get('deliveryZone') as string;
    const deliveryAddress = formData.get('deliveryAddress') as string;
    // Amounts arrive as centavos. Round defensively — Prisma rejects a
    // non-integer for an Int column, and a stray decimal here would 500.
    const centavos = (field: string) => Math.round(Number(formData.get(field)) || 0);

    const subtotal = centavos('subtotal');
    const deliveryFee = centavos('deliveryFee');
    const platformFee = centavos('platformFee');
    const transactionFee = centavos('transactionFee');
    const totalAmount = centavos('totalAmount');
    const paymentMethod = formData.get('paymentMethod') as string;
    const transactionNumber = formData.get('transactionNumber') as string;
    const consentGiven = formData.get('consentGiven') === 'true';
    const consentSignature = formData.get('consentSignature') as string;
    const promoCode = formData.get('promoCode') as string;

    const participantsStr = formData.get('participants') as string;
    const participants = JSON.parse(participantsStr || '[]');

    if (!proofFile) {
      return NextResponse.json({ error: 'Proof of payment is required' }, { status: 400 });
    }

    // The wizard already disables its submit button without this, but the
    // waiver is a legal gate, not a data-completeness one — an unauthorized
    // request that skips the UI must not be able to skip it either.
    if (!consentGiven) {
      return NextResponse.json(
        { error: 'Please agree to the Disclaimer, Consent & Data Privacy Waiver to continue.' },
        { status: 400 }
      );
    }

    // The signature is the other half of that gate, and it is checked here for
    // the same reason: a tick can be posted by anything, while a name that has
    // to match a runner on this very order is a claim the request itself has to
    // make good on. Uppercased first so the check runs on the value that will
    // be stored — see lib/consent-signature.ts, which both wizards share.
    const storedConsentSignature = upperCaseForStorage(consentSignature);
    const signatureProblem = consentSignatureError(
      storedConsentSignature,
      participants ?? []
    );
    if (signatureProblem) {
      return NextResponse.json({ error: signatureProblem }, { status: 400 });
    }

    // The client sends both the zone and the fee. They are two ways of saying
    // the same thing, so the organizer's prices decide which pairs are legal —
    // otherwise a registration could record "outside province" while paying the
    // inside rate. Same for the admin fee, which is now per event.
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
      deliveryFee !== expectedDeliveryFee ||
      platformFee !== expectedPlatformFee ||
      subtotal !== expectedSubtotal
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

    // The total matters more here than on the online route: this runner has
    // already transferred the money and is uploading the slip, so the amount
    // written on the order is what an organizer will reconcile against their
    // bank statement. A bank transfer carries no transaction fee.
    const expectedTotal =
      expectedSubtotal + expectedDeliveryFee + expectedPlatformFee + transactionFee - discountAmount;
    if (totalAmount !== expectedTotal) {
      return NextResponse.json(
        { error: 'Prices have changed. Please reload the page and try again.' },
        { status: 409 }
      );
    }

    // 1. Store the receipt as a private blob. This route is public — anyone can
    // reach it — so uploadPrivateProof() enforces the type and size limits.
    // What we keep is the blob pathname; admins view it through
    // /api/admin/proof/[id], which signs a short-lived URL after checking auth.
    const proofPathname = await uploadPrivateProof(proofFile);

    // Registrant text is stored uppercase (lib/text-case.ts). The wizard
    // already uppercases as the runner types, but this request did not have to
    // come from the wizard — a tab left open can POST straight here — so the
    // server is the one that decides what the column holds. The email address
    // is deliberately not in this list.
    const storedCustomerName = upperCaseForStorage(customerName);
    const storedDeliveryAddress = optionalUpperCaseForStorage(deliveryAddress);

    // 2. Generate Order Reference
    const orderRef = newOrderRef();

    // 3. Save to database. Slot limits are checked inside the write, not
    // before it: a count taken before the create is a count two simultaneous
    // orders can both pass. See reserveSlots, which locks the capped options
    // first.
    const registration = await prisma.$transaction(async (tx) => {
      await reserveSlots(tx, event.categories, participants);

      // Spent when the order is placed, not when the transfer is verified — a
      // bank transfer sits PENDING for days, and a voucher that only counted
      // on verification could be attached to any number of unverified orders
      // in the meantime. The same reasoning holds the slot.
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
          deliveryFee,
          subtotal,
          platformFee,
          transactionFee,
          totalAmount,
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
          proofOfPayment: proofPathname,
          transactionNumber: transactionNumber,
          status: 'PENDING', // Waiting for manual validation by admin
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

    // Sent now, not the receipt: a bank transfer is unverified money until an
    // admin looks at the proof, so this only confirms the submission — the
    // receipt (deliverConfirmationEmail) waits for that admin action. Whether
    // the send actually happened is written onto the registration, since on
    // Resend's free tier it may simply not have — see lib/email-delivery.ts.
    await deliverReceivedEmail(registration);

    return NextResponse.json({
      success: true, 
      orderRef: registration.orderRef 
    });

  } catch (error: any) {
    // A rejected file is the runner's mistake, not ours — tell them what to fix.
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // The order no longer fits — which option and by how much is already in
    // the message, so it goes back as it is rather than as a generic failure.
    // The proof is already in blob storage at this point and is left there:
    // the runner is about to resubmit, and deleting a receipt they may have
    // paid against is the worse mistake.
    if (error instanceof SlotsUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // Somebody else took the last redemption between the summary being drawn
    // and this write landing. Same shape as a slot shortfall: the message
    // already says what to do, so it goes back as it is.
    if (error instanceof PromoUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Manual Checkout Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
