/**
 * A staff member encodes a runner's order by hand (STAFF_REGISTRATION_PLAN.md
 * step 3): for a runner who registered over Messenger or a call and sent a
 * GCash or bank screenshot, because the website was not an option for them.
 *
 * **It is the bank-transfer checkout with a staff member at the keyboard,
 * and nothing more.** The form is read by `readManualCheckoutForm`, the event
 * gates by `checkoutGateRefusal`, the price by `priceCheckout` with the same
 * "Prices have changed" refusal, and the write by `placeOrder` — so the
 * promos, add-ons, slot caps, pause, close and duplicate-runner guard are
 * exactly the website's, and staff can override none of them. The order lands
 * PENDING · BANK_TRANSFER and goes through validation like any other.
 *
 * What differs, and why:
 * - **Auth**, `registration:create` on the race (the validate holders): a
 *   refusal reads 403, since a signed-in staff member may know the race exists.
 * - **Consent** is the staff member's tick that the runner agreed to the
 *   waiver over Messenger or a call; the signature is the runner's name as
 *   staff typed it. The audit row records which staff member confirmed it.
 * - **Proof, reference and Paid to are always required.** There is no free,
 *   QRPh, cash or complimentary path here (out of scope), so a ₱0 order is
 *   refused rather than written COMPLIMENTARY. Paid to follows the staff rule
 *   (`staffPaidTo`): an event listing no account records none.
 * - **Refusals name what staff may see** (M4, R5): a runner already registered
 *   names the other order ref, a reused reference names its holder.
 * - **No public rate limit**: the caller is signed in and on the record.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { newOrderRef } from '@/lib/order-ref';
import { recordWriteInCommunities } from '@/lib/running-community-store';
import { discardUnclaimedProof, uploadPrivateProof, UploadError } from '@/lib/blob';
import { asLogisticsMethod, PAYMENT_METHODS } from '@/lib/registration-codes';
import { SlotsUnavailableError } from '@/lib/registration-gate';
import { deliverReceivedEmail } from '@/lib/email-delivery';
import { optionalUpperCaseForStorage, upperCaseForStorage } from '@/lib/text-case';
import { PromoUnavailableError } from '@/lib/discount';
import { priceCheckout } from '@/lib/checkout-pricing';
import { ADD_ON_ORDER } from '@/lib/add-on-stock';
import { logHeldPrice } from '@/lib/price-lock';
import { priceChangedBody } from '@/lib/price-changed';
import { readManualCheckoutForm } from '@/lib/manual-checkout-form';
import { readTransactionNumber } from '@/lib/category-change-hold';
import { staffPaidTo } from '@/lib/payment-channel';
import {
  REFERENCE_INDEX_REFUSED,
  ReferenceInUseError,
  isReferenceIndexViolation,
} from '@/lib/payment-reference';
import { RunnerAlreadyRegisteredError } from '@/lib/runner-match';
import { checkoutGateRefusal } from '@/lib/order-gates';
import { placeOrder } from '@/lib/place-order';

/** Said when the promotion or the event make this order cost nothing. */
const FREE_ORDER_REFUSED =
  'This order comes to ₱0, so there is no transfer to record. A free entry is not added from here.';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The slip this request uploaded, until an order points at it.
  let unclaimedProof: string | null = null;

  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Only what the permission check needs, before the form is read.
    const reach = await prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true },
    });
    if (!reach) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    if (!can(actor, 'registration:create', { organizerId: reach.organizerId, eventId: reach.id })) {
      return NextResponse.json(
        { error: 'You do not have permission to add registrations to this race.' },
        { status: 403 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Send the order as a form with the payment proof attached.' },
        { status: 400 },
      );
    }

    // The same reading and checks as the website's bank-transfer form: the
    // consent tick, the signature, the order size, every email and birthdate.
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

    // The race in the address is the one the permission was checked on, so a
    // form naming another cannot slip an order into a race staff do not hold.
    if (eventId && eventId !== id) {
      return NextResponse.json({ error: 'This form is for a different race. Reload the page.' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        categories: true,
        addOns: { orderBy: ADD_ON_ORDER },
        bankAccounts: { select: { bankName: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    const gate = checkoutGateRefusal(event, participants);
    if (gate || !event) {
      return NextResponse.json(
        { error: gate?.error ?? 'Event not found' },
        { status: gate?.status ?? 404 },
      );
    }

    const storedLogisticsMethod = asLogisticsMethod(logisticsMethod);
    const storedPaymentMethod = PAYMENT_METHODS.BANK_TRANSFER;
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
    const { lockedAt, discount, discountAmount, free, total: expectedTotal, figures } = pricing;

    if (totalAmount !== expectedTotal || transactionFee !== 0) {
      return NextResponse.json(priceChangedBody(figures), { status: 409 });
    }
    if (free) return NextResponse.json({ error: FREE_ORDER_REFUSED }, { status: 400 });

    if (!proofFile) {
      return NextResponse.json(
        { error: 'Attach the screenshot of the payment the runner sent.', field: 'proofFile' },
        { status: 400 },
      );
    }
    const reference = readTransactionNumber(transactionNumber);
    if (reference.error) {
      return NextResponse.json({ error: reference.error, field: 'transactionNumber' }, { status: 400 });
    }
    const account = staffPaidTo(paidTo, event.bankAccounts);
    if (!account.ok) {
      return NextResponse.json({ error: account.error, field: 'paidTo' }, { status: 400 });
    }

    const proofPathname = await uploadPrivateProof(proofFile);
    unclaimedProof = proofPathname;

    const storedCustomerName = upperCaseForStorage(customerName);
    const storedDeliveryAddress = optionalUpperCaseForStorage(deliveryAddress);
    const orderRef = newOrderRef();
    const staffName = actor.name.trim() || actor.email;

    const registration = await prisma.$transaction(async (tx) => {
      const placed = await placeOrder(tx, {
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
          transactionNumber: reference.value,
          proofOfPayment: proofPathname,
          paidTo: account.value,
        },
        encodedBy: { id: actor.id, name: staffName },
      });
      // In the same transaction, so an order never exists without the record
      // of who encoded it and who vouched for the runner's consent.
      await recordAudit(tx, actor, {
        action: 'registration.created',
        entityType: 'Registration',
        entityId: placed.id,
        eventId: event.id,
        summary: `Encoded ${placed.orderRef} for ${storedConsentSignature} · consent confirmed by ${staffName}`,
        changes: {
          source: 'STAFF',
          runners: placed.runners.length,
          transactionNumber: reference.value,
          paidTo: account.value,
          totalAmount,
        },
      });
      return placed;
    });
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
    await recordWriteInCommunities(participants);
    // The same "we received your registration" mail the website sends; the
    // receipt waits for validation, as it does for every bank transfer.
    const email = await deliverReceivedEmail(registration);

    return NextResponse.json({
      success: true,
      id: registration.id,
      orderRef: registration.orderRef,
      emailSent: email.sent,
    });
  } catch (error: unknown) {
    await discardUnclaimedProof(unclaimedProof, 'Staff registration');
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, field: 'proofFile' }, { status: 400 });
    }
    if (error instanceof SlotsUnavailableError || error instanceof PromoUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // Staff may see whose payment holds it (R5).
    if (error instanceof ReferenceInUseError) {
      return NextResponse.json({ ...error.staffBody(), field: 'transactionNumber' }, { status: 409 });
    }
    // Staff may see the other order (M4).
    if (error instanceof RunnerAlreadyRegisteredError) {
      return NextResponse.json(
        { error: error.message, code: 'runnerAlreadyRegistered', orderRefs: error.orderRefs },
        { status: 409 },
      );
    }
    if (isReferenceIndexViolation(error)) {
      return NextResponse.json({ error: REFERENCE_INDEX_REFUSED, field: 'transactionNumber' }, { status: 409 });
    }
    console.error('Staff registration error:', error);
    return NextResponse.json({ error: 'Something went wrong saving this order. Nothing was saved.' }, { status: 500 });
  }
}
