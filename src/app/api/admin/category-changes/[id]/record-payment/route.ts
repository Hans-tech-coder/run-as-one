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
 * Sent as a form so the proof can ride along. The proof goes to the private
 * store (lib/blob.ts), already shrunk in the browser (lib/compress-proof.ts),
 * and is checked there for type and size again; a write that fails after the
 * upload deletes it again, so no slip is left that nothing points at.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { deletePrivateFile, uploadPrivateProof, UploadError } from '@/lib/blob';
import { readTransactionNumber } from '@/lib/category-change-hold';
import { CategoryChangeRefused, findChangeReachById } from '@/lib/category-change-context';
import { recordChangePayment } from '@/lib/category-change-payment';
import { deliverAppliedEmail, readCategoryChangeView } from '@/lib/category-change-view';
import db from '@/lib/db';

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
    if (error instanceof CategoryChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Category change payment failed:', error);
    return NextResponse.json({ error: 'The payment could not be recorded. Try again.' }, { status: 500 });
  }
}
