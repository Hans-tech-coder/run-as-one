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
 *
 * **`?path=` opens an earlier or replaced slip** (PAYMENT_CORRECTION_PLAN.md
 * C5, Batch 2): a payment correction keeps the old pathname in its trail row
 * (`changes.proofOfPayment = [old, new]`), and the history screen links to
 * both. The path is served only when it appears in a
 * `registration.payment.corrected` row of **this same order** — never a
 * pathname the caller made up, nor one from another order — under the same
 * `proof:view` check, the same short-lived signed URL and the same
 * `proof.viewed` row.
 */

/** Whether `path` is one of the slips this order's corrections recorded. */
async function isRecordedProof(registrationId: string, organizerId: string, path: string): Promise<boolean> {
  const rows = await prisma.auditLog.findMany({
    where: {
      organizerId,
      action: 'registration.payment.corrected',
      entityType: 'Registration',
      entityId: registrationId,
    },
    select: { changes: true },
  });
  return rows.some(row => {
    const pair = (row.changes as { proofOfPayment?: unknown } | null)?.proofOfPayment;
    return Array.isArray(pair) && pair.some(value => typeof value === 'string' && value === path);
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const path = new URL(request.url).searchParams.get('path');

  const registration = await prisma.registration.findUnique({
    where: { id },
    select: {
      proofOfPayment: true,
      orderRef: true,
      eventId: true,
      event: { select: { organizerId: true } },
    },
  });

  // With `?path=`, the order need not have a proof now: a correction may
  // have been the first one attached.
  if (!registration || (!path && !registration.proofOfPayment)) {
    return NextResponse.json({ error: 'No proof of payment on file' }, { status: 404 });
  }

  // An organizer's people see only their own events' registrations, and a
  // STAFF member only the races where their role includes proofs. A refusal
  // reads exactly like an order with no proof, so an id cannot be confirmed by
  // probing.
  const reach = { organizerId: registration.event.organizerId, eventId: registration.eventId };
  if (!can(actor, 'proof:view', reach)) {
    return NextResponse.json({ error: 'No proof of payment on file' }, { status: 404 });
  }

  // Checked after the permission, and refused with the same words, so a
  // pathname cannot be confirmed by probing.
  let pathname = registration.proofOfPayment;
  if (path) {
    if (path !== registration.proofOfPayment && !(await isRecordedProof(id, registration.event.organizerId, path))) {
      return NextResponse.json({ error: 'No proof of payment on file' }, { status: 404 });
    }
    pathname = path;
  }
  if (!pathname) {
    return NextResponse.json({ error: 'No proof of payment on file' }, { status: 404 });
  }

  try {
    const url = await signedProofUrl(pathname);
    await recordAudit(prisma, actor, {
      action: 'proof.viewed',
      entityType: 'Registration',
      entityId: id,
      eventId: registration.eventId,
      organizerId: registration.event.organizerId,
      summary: path && path !== registration.proofOfPayment
        ? `Opened an earlier proof of payment for ${registration.orderRef}.`
        : `Opened the proof of payment for ${registration.orderRef}.`,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Failed to sign proof URL:', error);
    return NextResponse.json({ error: 'Could not load proof of payment' }, { status: 500 });
  }
}
