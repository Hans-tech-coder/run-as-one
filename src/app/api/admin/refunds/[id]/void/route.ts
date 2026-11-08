/**
 * Void a refund not yet paid (REFUND_PLAN.md): the runner comes back through
 * the same locked counts checkout uses, or the void is refused and nothing
 * changes. An add-on short of stock is a SlotsUnavailableError too, so it is
 * caught first and staff are told which item ran out.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { AddOnStockError } from '@/lib/add-on-stock';
import { SlotsUnavailableError } from '@/lib/registration-gate';
import { RefundRefused, voidRefund } from '@/lib/refund-store';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const found = await prisma.runnerRefund.findUnique({
      where: { id },
      select: { eventId: true, event: { select: { organizerId: true } } },
    });
    if (!found || !can(actor, 'registration:refund', { organizerId: found.event.organizerId, eventId: found.eventId })) {
      return NextResponse.json({ error: 'Refund not found' }, { status: 404 });
    }
    const body = (await request.json().catch(() => null)) ?? {};
    const refund = await voidRefund(actor, id, body.reason);
    return NextResponse.json({ status: refund.status });
  } catch (error) {
    if (error instanceof RefundRefused) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: error.status });
    }
    if (error instanceof AddOnStockError) {
      return NextResponse.json(
        { error: `${error.item} has sold out since, so this runner cannot come back with it. Raise that add-on's stock first.` },
        { status: 409 },
      );
    }
    if (error instanceof SlotsUnavailableError) {
      return NextResponse.json(
        { error: 'The race has refilled, so this runner cannot come back. Raise the slot limit first, or keep the refund.' },
        { status: 409 },
      );
    }
    console.error('Void runner refund failed:', error);
    return NextResponse.json({ error: 'The refund could not be voided. Try again.' }, { status: 500 });
  }
}
