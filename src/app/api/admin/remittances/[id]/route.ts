import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { describeRemittance, readVoidReason } from '@/lib/settlement';

/**
 * Voids a remittance (ADMIN_MERGE_PLAN.md, Batch 6) — the only change a
 * recorded one can take.
 *
 * `{ void: true, reason }` and nothing else. A remittance is never edited and
 * never deleted: a wrong amount is voided with a reason and the right one
 * recorded beside it, so the page still shows what somebody once said was
 * paid, who said it, and who corrected it. A voided row stops counting toward
 * the balance and stays on the list.
 *
 * The write is conditional on the row still being RECORDED, so two people
 * voiding at once cannot both win, and it shares its transaction with the
 * trail row.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (body?.void !== true) {
      return NextResponse.json({ error: 'A remittance can only be voided here.' }, { status: 400 });
    }

    const remittance = await prisma.remittance.findFirst({
      where: { id, event: { organizerId: actor.orgId } },
      select: {
        id: true,
        kind: true,
        amount: true,
        method: true,
        paidOn: true,
        status: true,
        eventId: true,
        event: { select: { title: true, organizerId: true } },
      },
    });
    if (
      !remittance ||
      !can(actor, 'remittance:manage', { organizerId: remittance.event.organizerId, eventId: remittance.eventId })
    ) {
      return NextResponse.json({ error: 'Remittance not found.' }, { status: 404 });
    }

    const { reason, errors } = readVoidReason(body.reason);
    if (!reason) {
      return NextResponse.json({ error: errors.reason, errors }, { status: 400 });
    }

    if (remittance.status !== 'RECORDED') {
      return NextResponse.json({ error: 'This remittance has already been voided.' }, { status: 409 });
    }

    const voided = await prisma.$transaction(async tx => {
      const claimed = await tx.remittance.updateMany({
        where: { id: remittance.id, status: 'RECORDED' },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: actor.id,
          voidedByName: actor.name.trim() || actor.email,
          voidReason: reason,
        },
      });
      if (claimed.count === 0) return false;

      await recordAudit(tx, actor, {
        action: 'remittance.voided',
        entityType: 'Remittance',
        entityId: remittance.id,
        eventId: remittance.eventId,
        organizerId: remittance.event.organizerId,
        summary: `Voided the ${describeRemittance(remittance)} of ${remittance.paidOn} for ${remittance.event.title}: ${reason}`,
        changes: { status: ['RECORDED', 'VOIDED'], reason },
      });
      return true;
    });

    if (!voided) {
      return NextResponse.json({ error: 'This remittance has already been voided.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Void remittance error:', error);
    return NextResponse.json({ error: 'The remittance could not be voided. Please try again.' }, { status: 500 });
  }
}
