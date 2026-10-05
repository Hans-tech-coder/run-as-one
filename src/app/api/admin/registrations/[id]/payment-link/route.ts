/**
 * "Copy payment link" on the Unpaid checkouts tab (UNPAID_FOLLOWUP_PLAN.md
 * Batch 3): a link the runner opens to finish paying an order they abandoned,
 * without registering again. The link itself is a signed token
 * (lib/resume-payment.ts); this route only hands it out.
 *
 * **It moves the hold, once** (decision D4). A link given at hour 20 would die
 * with the order a few hours later, so the first link for an order holds its
 * slot for `PAYMENT_LINK_HOLD_HOURS` from now, never past race day
 * (`extendedHold`, lib/pending-expiry.ts). A second copy keeps that hold and
 * gets a link expiring with it. The claim is conditional on `holdUntil` still
 * being null, so two staff members copying at once move it once.
 *
 * **`registration:email`** (decision D3): a link lets whoever holds it pay,
 * so it goes out on the same permission as any other message to the runner.
 * Scoped to the order's own race, as the status route is, and only for an
 * order the tab lists and that can still be paid (`payableState`). An expired
 * order is refused; its row offers the event's registration link instead
 * (decision D5).
 *
 * Every copy is recorded on the trail: the link is a key to the order, and
 * the person who handed it out is who a question about it goes to.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { formatEventInstant, today } from '@/lib/event-schedule';
import { expiresBy, extendedHold, unpaidFollowUpWhere } from '@/lib/pending-expiry';
import {
  createResumePaymentToken,
  payableState,
  resumePaymentUrl,
  type PayableState,
} from '@/lib/resume-payment';

const REFUSALS: Record<Exclude<PayableState, 'payable'>, string> = {
  paid: 'is already paid, so there is nothing left to pay. Reload the page.',
  cancelled: 'was cancelled, so it can no longer be paid.',
  expired: 'has expired: its slot was released. Copy the registration link instead, so the runner registers again.',
  unavailable: 'cannot be paid online any more. Its payment method is no longer offered, or no runner is left on it.',
};

export async function POST(
  request: Request,
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
        eventId: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
        holdUntil: true,
        deletedAt: true,
        event: { select: { organizerId: true, date: true } },
        _count: { select: { runners: { where: { deletedAt: null } } } },
      },
    });
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const reach = { organizerId: registration.event.organizerId, eventId: registration.eventId };
    if (!can(actor, 'registration:email', reach)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ref = registration.orderRef;
    const listed = await prisma.registration.count({
      where: { id, ...unpaidFollowUpWhere(registration.event.date, today()) },
    });
    const now = new Date();
    const state = listed === 0
      ? 'unavailable'
      : payableState({ ...registration, liveRunners: registration._count.runners }, now);
    if (state !== 'payable') {
      return NextResponse.json({ error: `${ref} ${REFUSALS[state]}` }, { status: 409 });
    }

    // The first link moves the hold. Conditional, so a second copy landing at
    // the same moment finds it already moved and leaves it.
    let holdUntil = registration.holdUntil;
    const extended = extendedHold(registration, registration.event.date, now);
    if (extended) {
      const claim = await prisma.registration.updateMany({
        where: { id, status: 'PENDING', holdUntil: null },
        data: { holdUntil: extended },
      });
      holdUntil = claim.count > 0
        ? extended
        : (await prisma.registration.findUnique({ where: { id }, select: { holdUntil: true } }))?.holdUntil ?? null;
    }
    // The link lives exactly as long as the tab's "Expires by" says the order does.
    const until = expiresBy(registration.createdAt, holdUntil);

    const token = await createResumePaymentToken(id, until);
    const url = resumePaymentUrl(new URL(request.url).origin, token);

    const untilLabel = formatEventInstant(until);
    // Only the copy whose claim moved the hold records the move.
    const moved = extended !== null && holdUntil?.getTime() === extended.getTime();
    await recordAudit(prisma, actor, {
      action: 'registration.payment_link.copied',
      entityType: 'Registration',
      entityId: id,
      eventId: registration.eventId,
      organizerId: registration.event.organizerId,
      summary: moved
        ? `Copied a payment link for ${ref}. Its slot is held until ${untilLabel}.`
        : `Copied a payment link for ${ref}, valid until ${untilLabel}.`,
      changes: moved ? { holdUntil: [null, extended.toISOString()] } : undefined,
    });

    return NextResponse.json({ url, expiresBy: until.toISOString(), untilLabel });
  } catch (error) {
    console.error('Payment link failed:', error);
    return NextResponse.json({ error: 'The payment link could not be made. Try again.' }, { status: 500 });
  }
}
