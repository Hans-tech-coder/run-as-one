/**
 * Correct a manual order's payment details: its Transaction No., its proof of
 * payment and/or its manual payment method (PAYMENT_CORRECTION_PLAN.md
 * Batch 1). The rule lives in lib/payment-correction.ts; this route is the
 * door to it.
 *
 * Multipart form: optional `proofFile`, optional `transactionNumber`,
 * optional `paymentMethod`, required `reason`, `expectedStatus` (the status
 * the screen showed, like the cancel flow), `stepUpToken` for a PAID order,
 * and `resendReceipt` ("true") to send a PAID order's receipt again (C6).
 *
 * **Auth** is `registration:correct-payment` on the order's race; a refusal
 * reads like a missing order, as the status route's does. **A PAID order needs
 * a step-up token** (C2a), spent inside the correction's transaction so a
 * refused correction leaves it good for the retry; a PENDING one does not.
 *
 * **Cheap refusals come before the upload** (not found, no permission, online
 * or wrong-status order, missing reason, missing token on a PAID order,
 * nothing sent), so most refusals never write a blob. A refusal after the
 * upload discards it — on a deployment only, as `api/checkout/manual` does:
 * the private store is shared with production and nothing local deletes from
 * it, so a local refusal keeps the blob and logs its pathname.
 *
 * Correcting never moves the status (C8), and the runner hears nothing unless
 * staff tick the resend on a PAID order (C6).
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { deletePrivateFile, uploadPrivateProof, UploadError } from '@/lib/blob';
import { EMAIL_RUNNER_INCLUDE } from '@/lib/email';
import { deliverConfirmationEmail } from '@/lib/email-delivery';
import {
  CorrectionRefused,
  correctPayment,
  lockOrder,
  readCorrectionReason,
  refusalFor,
} from '@/lib/payment-correction';
import { consumeStepUp } from '@/lib/step-up';

const NOT_FOUND = { error: 'Registration not found' };
const STEP_UP_REFUSED = "Confirm it's you again. Correcting a paid order's payment needs a fresh confirmation.";

/** A form field as text, or undefined when it was not sent. */
function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' ? value : undefined;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The slip this request uploaded, until the correction that points at it commits.
  let unclaimedProof: string | null = null;

  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Send the correction as a form.' }, { status: 400 });
    }

    const existing = await prisma.registration.findUnique({
      where: { id },
      select: {
        id: true,
        orderRef: true,
        status: true,
        paymentMethod: true,
        eventId: true,
        event: { select: { organizerId: true } },
      },
    });
    if (!existing) return NextResponse.json(NOT_FOUND, { status: 404 });

    const reach = { organizerId: existing.event.organizerId, eventId: existing.eventId };
    if (!can(actor, 'registration:correct-payment', reach)) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    const expectedStatus = field(form, 'expectedStatus');
    const transactionNumber = field(form, 'transactionNumber');
    const paymentMethod = field(form, 'paymentMethod');
    const stepUpToken = field(form, 'stepUpToken');
    const resendReceipt = field(form, 'resendReceipt') === 'true';
    const proofEntry = form.get('proofFile');
    const proofFile = proofEntry instanceof File && proofEntry.size > 0 ? proofEntry : null;

    // Everything that can be refused without the lock, before any upload.
    readCorrectionReason(field(form, 'reason'));
    const early = refusalFor(existing, expectedStatus);
    if (early) throw early;
    if (!proofFile && !transactionNumber?.trim() && !paymentMethod?.trim()) {
      throw new CorrectionRefused('Nothing to correct. Enter a reference number or attach a new proof.', 400);
    }
    if (existing.status === 'PAID' && !stepUpToken) throw new CorrectionRefused(STEP_UP_REFUSED, 403);

    if (proofFile) {
      unclaimedProof = await uploadPrivateProof(proofFile);
    }

    const result = await prisma.$transaction(async tx => {
      const order = await lockOrder(tx, id);
      if (!order) throw new CorrectionRefused(NOT_FOUND.error, 404);

      const refused = refusalFor(order, expectedStatus);
      if (refused) throw refused;

      // C2a. Read under the lock, so an order paid a moment ago needs the token too.
      if (
        order.status === 'PAID' &&
        !(await consumeStepUp(stepUpToken, { actor, action: 'registration.correct-payment', targetId: id }, tx))
      ) {
        throw new CorrectionRefused(STEP_UP_REFUSED, 403);
      }

      const corrected = await correctPayment(tx, {
        registrationId: id,
        order,
        organizerId: existing.event.organizerId,
        transactionNumber,
        proofPathname: unclaimedProof,
        paymentMethod,
        reason: field(form, 'reason'),
        expectedStatus,
        actor,
      });
      return { ...corrected, status: order.status };
    });
    unclaimedProof = null;

    // C6: only when staff asked, and only for a PAID order — a PENDING one has
    // no receipt yet. Sent to the order's own contact email, like every receipt.
    let receipt: { sent: boolean; error?: string } | null = null;
    if (resendReceipt && result.status === 'PAID') {
      const full = await prisma.registration.findUnique({
        where: { id },
        include: { event: true, runners: { where: { deletedAt: null }, include: EMAIL_RUNNER_INCLUDE } },
      });
      if (full) {
        const outcome = await deliverConfirmationEmail(full);
        receipt = outcome.sent ? { sent: true } : { sent: false, error: outcome.error };
      }
    }

    return NextResponse.json({
      success: true,
      corrected: result.fields,
      changes: result.changes,
      receipt,
      by: actor.name,
      at: new Date().toISOString(),
    });
  } catch (error: unknown) {
    await discardUnclaimedProof(unclaimedProof);
    if (error instanceof CorrectionRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Payment correction failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Delete a proof no correction ended up pointing at. Deployment only, best
 * effort — the same rule and reasons as `discardUnclaimedProof` in
 * `api/checkout/manual/route.ts`.
 */
async function discardUnclaimedProof(pathname: string | null): Promise<void> {
  if (!pathname) return;
  if (process.env.VERCEL !== '1') {
    console.warn(`Payment correction failed; kept unclaimed proof ${pathname} (not deleted off Vercel).`);
    return;
  }
  try {
    await deletePrivateFile(pathname);
  } catch (error) {
    console.error(`Payment correction failed; could not delete unclaimed proof ${pathname}:`, error);
  }
}
