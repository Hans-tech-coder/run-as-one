/**
 * Switching a paid order between kit pickup and delivery
 * (LOGISTICS_CHANGE_PLAN.md, Session 2). `registration:edit`, the permission
 * Change category takes, scoped to the order's own race; a refusal reads
 * exactly like a missing order.
 *
 * - **`?preview=1`** writes nothing: the order and its runners' home
 *   addresses, which way it may switch and whether it may now, the customer's
 *   other paid pickup orders that can join (L6), the orders riding on its
 *   parcel that must go back with it (L10), the event's paid parcels and
 *   delivery fees, and how a fee may be paid. The modal computes the live
 *   quote in the browser with the same `quoteLogisticsChange` from these.
 * - **Otherwise it makes the switch**, recomputing the fee under the event's
 *   locks (lib/logistics-change-store.ts). With nothing to pay — back to
 *   pickup, or riding on a parcel already paid for — it applies at once. With
 *   a fee it waits for payment (`paymentChoice` required) and nothing moves;
 *   the payment link, the recorded payment and the emails are Session 3.
 *
 * Answers with the switch and every touched row's Logistics fields, keyed by
 * runner id, so the table replaces its copies without a reload.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { asChangePaymentChoice, CHANGE_PAYMENT_CHOICES, paymentMethodForChoice } from '@/lib/category-change-hold';
import { LogisticsChangeRefused, findOrderReach, previewLogisticsChange } from '@/lib/logistics-change-context';
import { createLogisticsChange } from '@/lib/logistics-change-store';
import { readLogisticsChangeView, readOrderLogistics } from '@/lib/logistics-change-view';

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

    if (new URL(request.url).searchParams.get('preview') === '1') {
      return NextResponse.json(await previewLogisticsChange(id));
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const includeIds = Array.isArray(body.includeOrderIds)
      ? body.includeOrderIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length > MAX_REASON) {
      return NextResponse.json(
        { error: `Keep what the runner asked for to ${MAX_REASON} characters.`, field: 'reason' },
        { status: 400 },
      );
    }

    const choice = asChangePaymentChoice(body.paymentChoice);
    // Recording a payment already made is Session 3; until then it would only
    // leave a switch waiting for money that came in.
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
      includeIds,
      target: {
        deliveryAddress: typeof body.deliveryAddress === 'string' ? body.deliveryAddress : null,
        deliveryZone: body.deliveryZone,
        deliverySplit: body.deliverySplit === true,
      },
      paymentMethod,
      reason,
    });

    const view = await readLogisticsChangeView(change.id);
    return NextResponse.json({
      change: view,
      rows: await readOrderLogistics(view.orders.map(order => order.registrationId)),
    });
  } catch (error) {
    if (error instanceof LogisticsChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Logistics change failed:', error);
    return NextResponse.json({ error: 'The order could not be switched. Try again.' }, { status: 500 });
  }
}
