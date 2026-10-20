/**
 * Submit proof on a GCash or bank category change's link (`/pay/change/[token]`,
 * the owner, 2026-10-20): the payment's screenshot and its reference, as a
 * form, onto the waiting change by `submitChangeProof`. Staff then validate it.
 *
 * **Public, so rate-limited** (`PAY_LINK_RULE`), and it trusts nothing but the
 * signed token. The file goes through `uploadPrivateProof`, the bank-transfer
 * checkout's own type and size rules, after the token and reference are
 * checked, so a refusal costs no blob write; one refused after the upload is
 * deleted. The delivery switch's twin is `api/logistics-change/proof`.
 */

import { NextResponse } from 'next/server';
import { PAY_LINK_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { readChangePaymentToken } from '@/lib/resume-payment';
import { deletePrivateFile, uploadPrivateProof, UploadError } from '@/lib/blob';
import { readTransactionNumber } from '@/lib/category-change-hold';
import { CategoryChangeRefused } from '@/lib/category-change-context';
import { submitChangeProof } from '@/lib/category-change-runner';

export async function POST(request: Request) {
  if (!allowRequest('change-proof', callerKey(request), PAY_LINK_RULE)) {
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
    const changeId = typeof token === 'string' && token ? await readChangePaymentToken(token) : null;
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
    await submitChangeProof(changeId, { transactionNumber: reference.value, proofPathname: unclaimedProof });
    unclaimedProof = null;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (unclaimedProof) await deletePrivateFile(unclaimedProof).catch(() => undefined);
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, field: 'proofFile' }, { status: 400 });
    }
    if (error instanceof CategoryChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Category change proof failed:', error);
    return NextResponse.json({ error: 'Your proof could not be sent. Try again.' }, { status: 500 });
  }
}
