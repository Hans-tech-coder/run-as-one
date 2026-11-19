/**
 * *Tag account* on the registrants screen (PAYMENT_CHANNELS_PLAN.md D3): the
 * account an **untagged** bank transfer went into, read by a person off its
 * proof screenshot. Orders from before checkout asked for it keep
 * `paidTo = null` and count as *Untagged* (lib/payment-channel.ts) until
 * someone tags them here, one at a time.
 *
 * **From null only.** An order that already names an account is refused, and
 * the refusal points at *Correct Payment*, which changes it with a reason and
 * a before-and-after in the trail (lib/payment-correction.ts). The write is
 * conditional on `paidTo` still being null, so two people tagging the same
 * order at once cannot both land.
 *
 * `registration:validate`, the permission that confirms where a payment went
 * when it is validated, scoped to the order's own race; a refusal reads like a
 * missing order. **No step-up**: it moves no money and changes no status, it
 * only says which wallet already holds it. Written to the trail as
 * `registration.paid_to_tagged`.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { asPaidTo } from '@/lib/payment-channel';
import { PAYMENT_METHODS } from '@/lib/registration-codes';

const ALREADY_TAGGED = 'This order already says which account it was paid to. Use Correct Payment to change it.';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const order = await prisma.registration.findUnique({
      where: { id },
      select: {
        id: true,
        orderRef: true,
        eventId: true,
        paidTo: true,
        paymentMethod: true,
        event: { select: { organizerId: true, bankAccounts: { select: { bankName: true } } } },
      },
    });
    if (!order || !can(actor, 'registration:validate', { organizerId: order.event.organizerId, eventId: order.eventId })) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }
    if (order.paymentMethod !== PAYMENT_METHODS.BANK_TRANSFER) {
      return NextResponse.json(
        { error: 'Only a bank transfer is tagged with an account. Online payments count as PayMongo.' },
        { status: 409 },
      );
    }
    if (order.paidTo) return NextResponse.json({ error: ALREADY_TAGGED }, { status: 409 });

    const body = await request.json().catch(() => null);
    const paidTo = asPaidTo(body?.paidTo, order.event.bankAccounts);
    if (!paidTo) {
      return NextResponse.json({ error: "Choose one of this race's accounts.", field: 'paidTo' }, { status: 400 });
    }

    await prisma.$transaction(async tx => {
      const claim = await tx.registration.updateMany({
        where: { id, paidTo: null, paymentMethod: PAYMENT_METHODS.BANK_TRANSFER },
        data: { paidTo },
      });
      if (claim.count === 0) throw new AlreadyTagged();
      await recordAudit(tx, actor, {
        action: 'registration.paid_to_tagged',
        entityType: 'Registration',
        entityId: id,
        eventId: order.eventId,
        organizerId: order.event.organizerId,
        summary: `Tagged ${order.orderRef} as paid to ${paidTo}.`,
        changes: { paidTo: [null, paidTo] },
      });
    });

    return NextResponse.json({ paidTo });
  } catch (error) {
    if (error instanceof AlreadyTagged) return NextResponse.json({ error: ALREADY_TAGGED }, { status: 409 });
    console.error('Tag account failed:', error);
    return NextResponse.json({ error: 'The account could not be saved. Try again.' }, { status: 500 });
  }
}

/** Someone tagged it between the read and the write. */
class AlreadyTagged extends Error {}
