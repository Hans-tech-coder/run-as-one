/**
 * Refund one runner of a paid order (REFUND_PLAN.md). GET is what the modal
 * shows; POST opens the refund. The rule is `lib/refund.ts`, the writes
 * `lib/refund-store.ts`.
 *
 * Multipart POST: `reason`, `approverName`, `approvedOn`, `paidBy`,
 * `entryAmount` (Buy X get Y orders only, D10), `expectedStatus`, `stepUpToken`
 * and the organizer's approval as `approvalProof` (D3, D8).
 *
 * `registration:refund` on the runner's race, owners and admins only (D4); a
 * refusal reads like a missing runner. The token is spent inside the refund's
 * transaction, so a refused refund leaves it good for the retry.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor, type Actor } from '@/lib/actor';
import { discardUnclaimedProof, uploadPrivateProof, UploadError } from '@/lib/blob';
import { RefundRefused, createRefund, readRefundForm, readRefundQuote } from '@/lib/refund-store';

const NOT_FOUND = { error: 'Runner not found' };

async function reachable(actor: Actor, runnerId: string): Promise<boolean> {
  const runner = await prisma.runner.findUnique({
    where: { id: runnerId },
    select: { registration: { select: { eventId: true, event: { select: { organizerId: true } } } } },
  });
  return (
    runner !== null &&
    can(actor, 'registration:refund', {
      organizerId: runner.registration.event.organizerId,
      eventId: runner.registration.eventId,
    })
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!(await reachable(actor, id))) return NextResponse.json(NOT_FOUND, { status: 404 });
  const quote = await readRefundQuote(id);
  if (!quote) return NextResponse.json(NOT_FOUND, { status: 404 });
  return NextResponse.json(quote);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The approval this request uploaded, until the refund that points at it commits.
  let unclaimedProof: string | null = null;

  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!(await reachable(actor, id))) return NextResponse.json(NOT_FOUND, { status: 404 });

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Send the refund as a form.' }, { status: 400 });
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value : undefined;
    };
    const fields = {
      reason: text('reason'),
      approverName: text('approverName'),
      approvedOn: text('approvedOn'),
      paidBy: text('paidBy'),
      entryAmount: text('entryAmount'),
    };

    // Cheap refusals before the upload, so most never write a blob.
    readRefundForm(fields);
    const stepUpToken = text('stepUpToken');
    if (!stepUpToken) throw new RefundRefused("Confirm it's you again. A refund needs a fresh confirmation.", 403);
    const file = form.get('approvalProof');
    if (!(file instanceof File) || file.size === 0) {
      throw new RefundRefused("Attach the organizer's approval.", 400, 'approvalProof');
    }
    const approvalProof = await uploadPrivateProof(file, 'refunds');
    unclaimedProof = approvalProof;

    const refund = await createRefund({
      actor,
      runnerId: id,
      form: fields,
      approvalProof,
      stepUpToken,
      expectedStatus: text('expectedStatus'),
    });
    unclaimedProof = null;
    return NextResponse.json({ id: refund.id, amount: refund.amount }, { status: 201 });
  } catch (error) {
    await discardUnclaimedProof(unclaimedProof, 'Runner refund');
    if (error instanceof RefundRefused) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: error.status });
    }
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, field: 'approvalProof' }, { status: 400 });
    }
    console.error('Runner refund failed:', error);
    return NextResponse.json({ error: 'The refund could not be saved. Try again.' }, { status: 500 });
  }
}
