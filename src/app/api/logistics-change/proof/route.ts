/**
 * Submit proof on a GCash or bank delivery switch's link
 * (`/pay/logistics/[token]`, LOGISTICS_CHANGE_PLAN.md Revision 3 T5, T7): the
 * payment's screenshot and its reference, as a form, onto the waiting switch
 * by `submitSwitchProof`. Staff then check it and record the payment.
 *
 * **Public, so rate-limited** (`PAY_LINK_RULE`), and it trusts nothing but the
 * signed token. The file goes through `uploadPrivateProof`, the bank-transfer
 * checkout's own type and size rules, after the token and reference are
 * checked, so a refusal costs no blob write; one refused after the upload is
 * deleted.
 */

import { NextResponse } from 'next/server';
import { PAY_LINK_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { readSwitchPaymentToken } from '@/lib/resume-payment';
import { deletePrivateFile, uploadPrivateProof, UploadError } from '@/lib/blob';
import { readTransactionNumber } from '@/lib/category-change-hold';
import { LogisticsChangeRefused } from '@/lib/logistics-change-context';
import { submitSwitchProof } from '@/lib/logistics-change-runner';

export async function POST(request: Request) {
  if (!allowRequest('switch-proof', callerKey(request), PAY_LINK_RULE)) {
    return NextResponse.json({ error: 'Too many tries from this connection. Wait a minute, then try again.' }, { status: 429 });
  }

  let unclaimedProof: string | null = null;
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Send the proof as a form.' }, { status: 400 });
    }
    const token = form.get('token');
    const changeId = typeof token === 'string' && token ? await readSwitchPaymentToken(token) : null;
    if (!changeId) return NextResponse.json({ error: 'This link is not valid any more.' }, { status: 404 });

    const reference = readTransactionNumber(form.get('transactionNumber'));
    if (reference.error || !reference.value) {
      return NextResponse.json({ error: reference.error, field: 'transactionNumber' }, { status: 400 });
    }
    const proof = form.get('proofFile');
    if (!(proof instanceof File) || proof.size === 0) {
      return NextResponse.json({ error: 'Add the screenshot of your payment.', field: 'proofFile' }, { status: 400 });
    }

    unclaimedProof = await uploadPrivateProof(proof);
    await submitSwitchProof(changeId, { transactionNumber: reference.value, proofPathname: unclaimedProof });
    unclaimedProof = null;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (unclaimedProof) await deletePrivateFile(unclaimedProof).catch(() => undefined);
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, field: 'proofFile' }, { status: 400 });
    }
    if (error instanceof LogisticsChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Delivery switch proof failed:', error);
    return NextResponse.json({ error: 'Your proof could not be sent. Try again.' }, { status: 500 });
  }
}
