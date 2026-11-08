/**
 * Opens a refund's approval (`?kind=approval`) or its payment proof
 * (`?kind=payment`) through a short-lived signed URL, as a remittance's receipt
 * opens. Each can carry a bank account and a name, so it is `registration:refund`
 * only, and each opening goes in the trail before the URL is handed over.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { signedProofUrl } from '@/lib/blob';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const refund = await prisma.runnerRefund.findUnique({
    where: { id },
    select: {
      approvalProof: true,
      paymentProof: true,
      eventId: true,
      event: { select: { organizerId: true } },
      runner: { select: { firstName: true, lastName: true } },
    },
  });
  if (!refund || !can(actor, 'registration:refund', { organizerId: refund.event.organizerId, eventId: refund.eventId })) {
    return NextResponse.json({ error: 'Refund not found' }, { status: 404 });
  }
  const payment = new URL(request.url).searchParams.get('kind') === 'payment';
  const pathname = payment ? refund.paymentProof : refund.approvalProof;
  if (!pathname) return NextResponse.json({ error: 'No proof on file for this refund.' }, { status: 404 });

  try {
    const url = await signedProofUrl(pathname);
    await recordAudit(prisma, actor, {
      action: 'runner_refund.proof.viewed',
      entityType: 'RunnerRefund',
      entityId: id,
      eventId: refund.eventId,
      organizerId: refund.event.organizerId,
      summary: `Opened the ${payment ? 'payment proof' : 'approval'} on the refund to ${refund.runner.firstName} ${refund.runner.lastName}.`,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Failed to sign refund proof URL:', error);
    return NextResponse.json({ error: 'Could not load the proof.' }, { status: 500 });
  }
}
