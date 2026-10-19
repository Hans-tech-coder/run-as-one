/**
 * The screenshot staff attached when they recorded a delivery switch's GCash
 * or bank payment (LOGISTICS_CHANGE_PLAN.md Session 3), served the way a
 * category change's is: `proof:view` scoped to the switch's race, a
 * short-lived signed URL from the private store, and a `proof.viewed` row
 * written before the URL is handed over. A refusal reads exactly like a switch
 * with no proof, so an id cannot be confirmed by probing.
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { signedProofUrl } from '@/lib/blob';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const change = await db.logisticsChange.findUnique({
    where: { id },
    select: { proofOfPayment: true, changeRef: true, eventId: true, event: { select: { organizerId: true } } },
  });
  const missing = NextResponse.json({ error: 'No proof of payment on file' }, { status: 404 });
  if (!change?.proofOfPayment) return missing;
  if (!can(actor, 'proof:view', { organizerId: change.event.organizerId, eventId: change.eventId })) return missing;

  try {
    const url = await signedProofUrl(change.proofOfPayment);
    await recordAudit(db, actor, {
      action: 'proof.viewed',
      entityType: 'LogisticsChange',
      entityId: id,
      eventId: change.eventId,
      organizerId: change.event.organizerId,
      summary: `Opened the proof of payment for delivery switch ${change.changeRef}.`,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Failed to sign delivery switch proof URL:', error);
    return NextResponse.json({ error: 'Could not load proof of payment' }, { status: 500 });
  }
}
