/**
 * "Check with PayMongo" on the Unpaid checkouts tab (UNPAID_ORDERS_PLAN.md
 * Batch 4): before staff chase a runner for an unpaid online order, ask
 * PayMongo whether it was in fact paid. A QRPh payment can succeed while its
 * webhook arrives late or never, and a runner who paid should not be told
 * they did not.
 *
 * **Gated like settling a payment** (`registration:validate`), because a check
 * that finds the money marks the order PAID. ENCODER and VIEWER see the tab
 * but not the button. Scoped to the order's own race, as the status route is.
 *
 * **A found payment goes through the webhook's own path**
 * (`settleOnlinePayment` in lib/online-payment.ts), so the order flips only
 * from PENDING and the runner gets the same receipt. An EXPIRED order is not
 * flipped even when PayMongo has the money: its slot and promo were already
 * handed back, so a person decides between a reinstate and a refund.
 *
 * Only a check that changes the status writes to the trail. A check that
 * finds nothing changed nothing, and logging every look would bury the rows
 * that matter.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { isBankTransfer, isComplimentary } from '@/lib/registration-codes';
import { lookUpPaymongoPayment, settleOnlinePayment } from '@/lib/online-payment';

/**
 * What the button reports. The dialog titles each result ("No payment found"),
 * so `message` is the sentence under it and never repeats the title.
 */
type CheckResult = 'marked_paid' | 'already_paid' | 'paid_after_expiry' | 'not_paid';

function answer(result: CheckResult, message: string) {
  return NextResponse.json({ result, message });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const registration = await prisma.registration.findUnique({
      where: { id },
      select: {
        id: true,
        orderRef: true,
        status: true,
        paymentMethod: true,
        checkoutSessionId: true,
        eventId: true,
        event: { select: { organizerId: true } },
      },
    });
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const reach = { organizerId: registration.event.organizerId, eventId: registration.eventId };
    if (!can(actor, 'registration:validate', reach)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A bank transfer is settled by its proof, and a complimentary entry owes
    // nothing: PayMongo has nothing to say about either.
    if (isBankTransfer(registration.paymentMethod) || isComplimentary(registration.paymentMethod)) {
      return NextResponse.json(
        { error: 'Only online checkouts are paid through PayMongo. This order is not one.' },
        { status: 400 }
      );
    }

    const ref = registration.orderRef;
    if (registration.status === 'PAID') {
      return answer('already_paid', `${ref} is already paid. It is on the Registrants tab.`);
    }
    if (registration.status !== 'PENDING' && registration.status !== 'EXPIRED') {
      return NextResponse.json(
        { error: `${ref} is ${registration.status.toLowerCase()}, so there is no payment to check.` },
        { status: 409 }
      );
    }

    // A failed checkout is normally discarded (discardFailedCheckout), but one
    // whose discard also failed is left PENDING with no payment page behind it.
    if (!registration.checkoutSessionId) {
      return answer('not_paid', `${ref} never reached a PayMongo payment page, so nothing was paid.`);
    }

    const lookup = await lookUpPaymongoPayment(registration.checkoutSessionId);
    if ('error' in lookup) {
      return NextResponse.json({ error: lookup.error }, { status: 502 });
    }
    if (!lookup.paid) {
      return answer('not_paid', `PayMongo has not received payment for ${ref}. Follow up with the runner.`);
    }

    if (registration.status === 'EXPIRED') {
      return answer(
        'paid_after_expiry',
        `PayMongo received payment for ${ref}, but the order had already expired and given back its slot. It needs a reinstate or a refund.`
      );
    }

    const settled = await settleOnlinePayment(registration.id, {
      actor,
      entry: {
        action: 'registration.status.changed',
        entityType: 'Registration',
        entityId: registration.id,
        eventId: registration.eventId,
        organizerId: registration.event.organizerId,
        summary: `Marked ${ref} as PAID (was PENDING) after PayMongo confirmed the payment.`,
        changes: { status: ['PENDING', 'PAID'] },
      },
    });

    // Between the read above and the flip, the webhook may have landed or the
    // sweep may have run; the shared path says which.
    if (settled.outcome === 'marked_paid') {
      // Not "receipt sent": Resend can refuse it, and the registrants screen's
      // email backlog is where that shows.
      return answer('marked_paid', `PayMongo confirmed the payment. ${ref} is now paid and on the Registrants tab.`);
    }
    if (settled.outcome === 'already_paid') {
      return answer('already_paid', `${ref} is already paid. It is on the Registrants tab.`);
    }
    return answer(
      'paid_after_expiry',
      `PayMongo received payment for ${ref}, but the order is now ${settled.status.toLowerCase()}. It needs a reinstate or a refund.`
    );
  } catch (error) {
    console.error('Payment check failed:', error);
    return NextResponse.json({ error: 'The check could not be finished. Try again.' }, { status: 500 });
  }
}
