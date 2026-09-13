import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { signedProofUrl } from '@/lib/blob';

/**
 * Serves one registration's proof of payment to the admin who is allowed to
 * see it, by redirecting to a short-lived signed blob URL.
 *
 * Proofs used to live in public/uploads/proofs with a guessable-ish filename
 * and no auth at all — anyone who had a URL could read someone else's receipt.
 * Access is now checked on every view.
 *
 * **Every view is recorded** (`proof.viewed`). Opening a deposit slip is one of
 * the two ways personal data leaves the system without changing anything, and
 * under the Data Privacy Act it is exactly what an incident review asks about.
 * The row is written before the URL is handed over, so a proof is never served
 * without its record — and it names only which order's proof, never its
 * contents.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const registration = await prisma.registration.findUnique({
    where: { id },
    select: {
      proofOfPayment: true,
      orderRef: true,
      eventId: true,
      event: { select: { organizerId: true } },
    },
  });

  if (!registration?.proofOfPayment) {
    return NextResponse.json({ error: 'No proof of payment on file' }, { status: 404 });
  }

  // An organizer's people see only their own events' registrations, and a
  // STAFF member only the races where their role includes proofs.
  const reach = { organizerId: registration.event.organizerId, eventId: registration.eventId };
  if (!can(actor, 'proof:view', reach)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = await signedProofUrl(registration.proofOfPayment);
    await recordAudit(prisma, actor, {
      action: 'proof.viewed',
      entityType: 'Registration',
      entityId: id,
      eventId: registration.eventId,
      organizerId: registration.event.organizerId,
      summary: `Opened the proof of payment for ${registration.orderRef}.`,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Failed to sign proof URL:', error);
    return NextResponse.json({ error: 'Could not load proof of payment' }, { status: 500 });
  }
}
