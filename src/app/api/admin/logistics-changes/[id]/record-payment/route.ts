/**
 * Recording a delivery switch's fee paid outside the app
 * (LOGISTICS_CHANGE_PLAN.md Session 3): GCash or a bank transfer staff saw
 * land, with its reference number and, optionally, a screenshot of it.
 * Recording it applies the switch — the order's logistics move, never its
 * amounts (L4), and the *switched* email goes out — with the money on the row
 * as it really came in: `totalCharged` is the fee and there is no transaction
 * fee (lib/logistics-change-payment.ts).
 *
 * `registration:validate`, the permission that settles an order's money,
 * scoped to the switch's own race; a refusal reads like a missing switch.
 *
 * Sent as a form so the proof can ride along. The proof goes to the private
 * store (lib/blob.ts), already shrunk in the browser (lib/compress-proof.ts),
 * and is checked there for type and size again; a write that fails after the
 * upload deletes it again, so no slip is left that nothing points at.
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { deletePrivateFile, uploadPrivateProof, UploadError } from '@/lib/blob';
import { readTransactionNumber } from '@/lib/category-change-hold';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';
import { LogisticsChangeRefused, findSwitchReach } from '@/lib/logistics-change-context';
import { deliverSwitchEmail, recordSwitchPayment } from '@/lib/logistics-change-payment';
import { readLogisticsChangeView } from '@/lib/logistics-change-view';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let unclaimedProof: string | null = null;
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findSwitchReach(id);
    if (!reach || !can(actor, 'registration:validate', reach)) {
      return NextResponse.json({ error: 'Delivery switch not found' }, { status: 404 });
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
    const current = await db.logisticsChange.findUnique({ where: { id }, select: { status: true } });
    if (current?.status !== LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT) {
      return NextResponse.json({ error: 'This switch is no longer waiting for payment. Reload the page.' }, { status: 409 });
    }

    const proof = form.get('proofFile');
    if (proof instanceof File && proof.size > 0) {
      unclaimedProof = await uploadPrivateProof(proof);
    }

    await recordSwitchPayment(actor, id, { transactionNumber: reference.value, proofPathname: unclaimedProof });
    unclaimedProof = null;

    const email = await deliverSwitchEmail(id, 'applied').catch(error => {
      console.error('Delivery switch email failed:', error);
      return { sent: false as const, error: 'The email could not be prepared.', message: null };
    });
    return NextResponse.json({ change: await readLogisticsChangeView(id), email });
  } catch (error) {
    if (unclaimedProof) await deletePrivateFile(unclaimedProof).catch(() => undefined);
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, field: 'proofFile' }, { status: 400 });
    }
    if (error instanceof LogisticsChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Delivery switch payment failed:', error);
    return NextResponse.json({ error: 'The payment could not be recorded. Try again.' }, { status: 500 });
  }
}
