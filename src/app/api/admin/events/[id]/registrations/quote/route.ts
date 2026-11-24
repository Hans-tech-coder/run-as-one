/**
 * What an order staff are encoding costs right now (STAFF_REGISTRATION_PLAN.md
 * step 4): the staff form's live total.
 *
 * **The server's figures, from the checkout's own walk** (`priceCheckout` in
 * quote mode), rather than a copy of the wizard's arithmetic in the form: the
 * total a validator reads off this is the total the save will check against,
 * promotions, price lock, add-ons and pacer waivers included, so the two
 * cannot drift. A code that does not apply comes back with the sentence the
 * checkout refuses it with.
 *
 * Nothing is reserved or written. `registration:create` on the race, like the
 * save; read on demand as staff type, never polled.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { priceCheckout } from '@/lib/checkout-pricing';
import { ADD_ON_ORDER } from '@/lib/add-on-stock';
import { PAYMENT_METHODS } from '@/lib/registration-codes';
import { participantCategoryError } from '@/lib/registration-gate';
import { participantCountError } from '@/lib/order-size';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: { categories: true, addOns: { orderBy: ADD_ON_ORDER } },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (!can(actor, 'registration:create', { organizerId: event.organizerId, eventId: event.id })) {
    return NextResponse.json({ error: 'You do not have permission to add registrations to this race.' }, { status: 403 });
  }

  let body: {
    participants?: unknown;
    logisticsMethod?: unknown;
    deliveryZone?: unknown;
    deliveryAddress?: unknown;
    promoCode?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send the order as JSON.' }, { status: 400 });
  }

  // The two checks priceCheckout leans on having passed: a sane size, and
  // every runner in one of this race's own options (else it prices ₱0).
  const participants = body.participants;
  const problem = participantCountError(participants) ?? participantCategoryError(participants, event.categories);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const pricing = await priceCheckout(event, {
    participants: participants as { categoryId: string; singletSize: string; addOns?: unknown }[],
    logisticsMethod: body.logisticsMethod,
    deliveryZone: body.deliveryZone,
    deliveryAddress: typeof body.deliveryAddress === 'string' ? body.deliveryAddress : '',
    promoCode: body.promoCode,
    // No lock: staff encode at today's prices (no overrides).
    priceLock: null,
    paymentMethod: PAYMENT_METHODS.BANK_TRANSFER,
    posted: null,
  });
  if (pricing.refusal) return NextResponse.json(pricing.refusal.body, { status: pricing.refusal.status });

  return NextResponse.json({
    ...pricing.figures,
    free: pricing.free,
    promoApplied: pricing.discount.applied ? pricing.discount.applied.code : null,
  });
}
