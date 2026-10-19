/**
 * Switching one paid receipt between kit pickup and delivery
 * (LOGISTICS_CHANGE_PLAN.md Session 2, Revision 1 R3–R5), from its card on
 * Pickup & Delivery. `registration:edit`, the permission Change category takes,
 * scoped to the order's own race; a refusal reads exactly like a missing order.
 *
 * One receipt per switch: the body names where it ships (`deliveryAddress`,
 * `deliveryZone` when staff pick it, or `deliverySplit`), `paymentChoice` when
 * there is a fee, and an optional `reason`. The fee is recomputed under the
 * event's locks (lib/logistics-change-store.ts), which also refuse a second
 * receipt to an address still waiting for payment (R4) and a parcel others
 * still ride on (R5). With nothing to pay — back to pickup, or riding on a
 * parcel already paid for — it applies at once. With a fee it waits for
 * payment and nothing moves.
 *
 * After the write commits, the order's contact is emailed: *payment needed*
 * (the link, or the accounts to pay to) for a switch with a fee, *switched*
 * for one applied at once (Session 3, lib/logistics-change-payment.ts). A
 * failed send never undoes the switch; staff send it by hand from the card.
 *
 * Answers with the switch and how the email went. The screen reads everything it draws, the counts
 * and the other receipts' cards included, from a `router.refresh()`.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { asChangePaymentChoice, CHANGE_PAYMENT_CHOICES, paymentMethodForChoice } from '@/lib/category-change-hold';
import { LogisticsChangeRefused, findOrderReach } from '@/lib/logistics-change-context';
import { createLogisticsChange } from '@/lib/logistics-change-store';
import { readLogisticsChangeView } from '@/lib/logistics-change-view';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';
import { deliverSwitchEmail } from '@/lib/logistics-change-payment';

/** The longest "what the runner asked for" kept, a sentence or two. */
const MAX_REASON = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findOrderReach(id);
    if (!reach || !can(actor, 'registration:edit', reach)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length > MAX_REASON) {
      return NextResponse.json(
        { error: `Keep what the runner asked for to ${MAX_REASON} characters.`, field: 'reason' },
        { status: 400 },
      );
    }

    const choice = asChangePaymentChoice(body.paymentChoice);
    // "Already paid" in one step is not offered: the payment is recorded with
    // its reference and proof on the card's *Record payment*, after the switch
    // is opened as GCash or bank to come.
    if (choice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID) {
      return NextResponse.json(
        { error: 'Choose a payment link or GCash or bank to come.', field: 'paymentChoice' },
        { status: 400 },
      );
    }
    const paymentMethod = choice ? paymentMethodForChoice(choice) : null;
    if (choice && !paymentMethod) {
      return NextResponse.json(
        { error: 'Online payment is not offered right now. Choose GCash or bank transfer.', field: 'paymentChoice' },
        { status: 400 },
      );
    }

    const change = await createLogisticsChange(actor, {
      registrationId: id,
      target: {
        deliveryAddress: typeof body.deliveryAddress === 'string' ? body.deliveryAddress : null,
        deliveryZone: body.deliveryZone,
        deliverySplit: body.deliverySplit === true,
      },
      paymentMethod,
      reason,
    });

    const awaiting = change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
    const email = await deliverSwitchEmail(change.id, awaiting ? 'created' : 'applied', request.url).catch(error => {
      console.error('Delivery switch email failed:', error);
      return { sent: false as const, error: 'The email could not be prepared.', message: null };
    });
    return NextResponse.json({ change: await readLogisticsChangeView(change.id), email });
  } catch (error) {
    if (error instanceof LogisticsChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Logistics change failed:', error);
    return NextResponse.json({ error: 'The order could not be switched. Try again.' }, { status: 500 });
  }
}
