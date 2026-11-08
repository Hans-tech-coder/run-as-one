/**
 * Record that a runner's refund was paid by hand (REFUND_PLAN.md D6):
 * REFUND_DUE → REFUNDED with the reference and proof, then the runner's email.
 * Multipart: `reference`, `proof`. A ₱0 refund (a free seat with no add-ons)
 * moved no money, so it needs neither. The email goes after the commit and a
 * failed send never undoes the record; the response says how it went.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { uploadPrivateProof, UploadError } from '@/lib/blob';
import { runnerRefundedEmail } from '@/lib/email-refund';
import { sendEmail } from '@/lib/email-document';
import { RefundRefused, readRefundReference, recordRefund } from '@/lib/refund-store';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const found = await prisma.runnerRefund.findUnique({
      where: { id },
      select: { amount: true, eventId: true, event: { select: { organizerId: true, title: true } } },
    });
    if (!found || !can(actor, 'registration:refund', { organizerId: found.event.organizerId, eventId: found.eventId })) {
      return NextResponse.json({ error: 'Refund not found' }, { status: 404 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Send the record as a form.' }, { status: 400 });
    const needsProof = found.amount > 0;
    const reference = readRefundReference(form.get('reference'), needsProof);
    const file = form.get('proof');
    const hasFile = file instanceof File && file.size > 0;
    if (needsProof && !hasFile) throw new RefundRefused('Attach the proof the refund was sent.', 400, 'proof');
    const proof = hasFile ? await uploadPrivateProof(file, 'refunds') : null;

    const { refund, runner, order } = await recordRefund(actor, id, reference, proof);
    const outcome = await sendEmail(
      await runnerRefundedEmail({
        runner: { firstName: runner.firstName, email: runner.email },
        eventTitle: found.event.title,
        orderRef: order.orderRef,
        amount: refund.amount,
        reference,
      }),
    );
    return NextResponse.json({
      status: refund.status,
      email: outcome.sent ? { sent: true } : { sent: false, error: outcome.error },
    });
  } catch (error) {
    if (error instanceof RefundRefused) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: error.status });
    }
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, field: 'proof' }, { status: 400 });
    }
    console.error('Record runner refund failed:', error);
    return NextResponse.json({ error: 'The refund could not be recorded. Try again.' }, { status: 500 });
  }
}
