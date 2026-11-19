/**
 * Recording an upgrade's payment made outside the app (CATEGORY_CHANGE_PLAN.md
 * Session 3): GCash or a bank transfer staff saw land, with its reference
 * number and, optionally, a screenshot of it. Recording it applies the change —
 * the runner moves, the applied email goes out — with the money on the row as
 * it really came in: `totalCharged` is the change's amount and there is no
 * transaction fee (D13), whatever the change was opened expecting
 * (lib/category-change-payment.ts).
 *
 * `registration:validate`, the permission that settles an order's money,
 * scoped to the change's own race; a refusal reads like a missing change.
 *
 * **Paid to** (PAYMENT_CHANNELS_PLAN.md Batch 3): the account the money went
 * into, one of the event's own (`staffPaidTo`). *Validate Payment* sends the
 * runner's pick, or the validator's correction of it.
 *
 * Sent as a form so the proof can ride along. The proof goes to the private
 * store (lib/blob.ts), already shrunk in the browser (lib/image-compress.ts),
 * and is checked there for type and size again; a write that fails after the
 * upload deletes it again, so no slip is left that nothing points at.
 */

import { NextResponse } from 'next/server';
import { REFERENCE_INDEX_REFUSED, ReferenceInUseError, isReferenceIndexViolation } from '@/lib/payment-reference';
import { can, getActor } from '@/lib/actor';
import { deletePrivateFile, uploadPrivateProof, UploadError } from '@/lib/blob';
import { readTransactionNumber } from '@/lib/category-change-hold';
import { CategoryChangeRefused, findChangeReachById } from '@/lib/category-change-context';
import { recordChangePayment } from '@/lib/category-change-payment';
import { deliverAppliedEmail, readCategoryChangeView } from '@/lib/category-change-view';
import db from '@/lib/db';
import { staffPaidTo } from '@/lib/payment-channel';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let unclaimedProof: string | null = null;
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findChangeReachById(id);
    if (!reach || !can(actor, 'registration:validate', reach)) {
      return NextResponse.json({ error: 'Category change not found' }, { status: 404 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Send the payment as a form.' }, { status: 400 });
    }
    const reference = readTransactionNumber(form.get('transactionNumber'));
    if (reference.error || !reference.value) {
      return NextResponse.json({ error: reference.error, field: 'transactionNumber' }, { status: 400 });
    }
    const accounts = await db.bankAccount.findMany({ where: { eventId: reach.eventId }, select: { bankName: true } });
    const paidTo = staffPaidTo(form.get('paidTo'), accounts);
    if (!paidTo.ok) return NextResponse.json({ error: paidTo.error, field: 'paidTo' }, { status: 400 });

    // Checked before the upload, so a refusal costs no blob write.
    const current = await db.categoryChange.findUnique({ where: { id }, select: { status: true } });
    if (current?.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json(
        { error: 'This category change is no longer waiting for payment. Reload the page.' },
        { status: 409 },
      );
    }

    const proof = form.get('proofFile');
    if (proof instanceof File && proof.size > 0) {
      unclaimedProof = await uploadPrivateProof(proof);
    }

    const change = await recordChangePayment(actor, id, {
      transactionNumber: reference.value,
      proofPathname: unclaimedProof,
      paidTo: paidTo.value,
    });
    unclaimedProof = null;

    const email = await deliverAppliedEmail(id).catch(error => {
      console.error('Category change email failed:', error);
      return { sent: false as const, error: 'The email could not be prepared.', message: null };
    });
    const category = await db.category.findUnique({
      where: { id: change.toCategoryId },
      select: { id: true, name: true, distance: true },
    });
    return NextResponse.json({ change: await readCategoryChangeView(id), category, email, emailKind: 'applied' });
  } catch (error) {
    if (unclaimedProof) await deletePrivateFile(unclaimedProof).catch(() => undefined);
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, field: 'proofFile' }, { status: 400 });
    }
    // Another live payment already carries this reference: staff see which
    // one, as a link (lib/payment-reference.ts R5).
    if (error instanceof ReferenceInUseError) {
      return NextResponse.json(error.staffBody(), { status: 409 });
    }
    if (isReferenceIndexViolation(error)) {
      return NextResponse.json({ error: REFERENCE_INDEX_REFUSED }, { status: 409 });
    }
    if (error instanceof CategoryChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Category change payment failed:', error);
    return NextResponse.json({ error: 'The payment could not be recorded. Try again.' }, { status: 500 });
  }
}
