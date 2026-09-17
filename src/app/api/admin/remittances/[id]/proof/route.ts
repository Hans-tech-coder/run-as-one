import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { signedProofUrl } from '@/lib/blob';
import { describeRemittance } from '@/lib/settlement';

/**
 * Opens a remittance's receipt (ADMIN_MERGE_PLAN.md, Batch 6) by redirecting
 * to a short-lived signed URL, as `admin/proof/[id]` does for a runner's
 * deposit slip.
 *
 * A payout receipt carries the organizer's bank account and name, so it is
 * served only to `remittance:manage` on that race, and each opening is written
 * to the trail before the URL is handed over — the same rule a runner's proof
 * lives under.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const remittance = await prisma.remittance.findFirst({
    where: { id, event: { organizerId: actor.orgId } },
    select: {
      id: true,
      kind: true,
      amount: true,
      method: true,
      paidOn: true,
      proof: true,
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
  if (!remittance.proof) {
    return NextResponse.json({ error: 'No receipt on file for this remittance.' }, { status: 404 });
  }

  try {
    const url = await signedProofUrl(remittance.proof);
    await recordAudit(prisma, actor, {
      action: 'remittance.proof.viewed',
      entityType: 'Remittance',
      entityId: remittance.id,
      eventId: remittance.eventId,
      organizerId: remittance.event.organizerId,
      summary: `Opened the receipt for the ${describeRemittance(remittance)} of ${remittance.paidOn} for ${remittance.event.title}.`,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Failed to sign remittance receipt URL:', error);
    return NextResponse.json({ error: 'Could not load the receipt.' }, { status: 500 });
  }
}
