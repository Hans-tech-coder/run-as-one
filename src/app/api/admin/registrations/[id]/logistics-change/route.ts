/**
 * Switching one paid receipt between kit pickup and delivery
 * (LOGISTICS_CHANGE_PLAN.md Session 2, Revision 1 R3–R5), from its card on
 * Pickup & Delivery. `registration:edit`, the permission Change category takes,
 * scoped to the order's own race; a refusal reads exactly like a missing order.
 *
 * One receipt per switch: the body names where it ships (`deliveryAddress`,
 * `deliveryZone` when staff pick it, or `deliverySplit`), `paymentChoice` when
 * there is a fee, and an optional `reason`. The fee is recomputed under the
 * event's locks (lib/logistics-change-store.ts), which also refuse a second
 * receipt to an address still waiting for payment (R4) and a parcel others
 * still ride on (R5). With nothing to pay — back to pickup, or riding on a
 * parcel already paid for — it applies at once. With a fee it waits for
 * payment and nothing moves.
 *
 * **Already paid** (`OUTSIDE_PAID`, the owner's addition to Session 4): the
 * runner sent the fee by GCash or bank before asking. Sent as a form, so the
 * reference number and the proof ride along, and gated like *Record payment*
 * (`registration:validate` as well), because it is one. The proof goes to the
 * private store first, named and checked as *Record payment* stores it, and
 * the switch is written applied in the same transaction; a refusal after the
 * upload deletes it again, so no slip is left that nothing points at.
 *
 * After the write commits, the order's contact is emailed: *payment needed*
 * (the link, or the accounts to pay to) for a switch with a fee still to come,
 * *switched* for one applied at once, already paid included (Session 3,
 * lib/logistics-change-payment.ts). A failed send never undoes the switch;
 * staff send it by hand from the card.
 *
 * Answers with the switch and how the email went. The screen reads everything it draws, the counts
 * and the other receipts' cards included, from a `router.refresh()`.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { deletePrivateFile, uploadPrivateProof, UploadError } from '@/lib/blob';
import {
  asChangePaymentChoice,
  CHANGE_PAYMENT_CHOICES,
  paymentMethodForChoice,
  readTransactionNumber,
} from '@/lib/category-change-hold';
import { LogisticsChangeRefused, findOrderReach } from '@/lib/logistics-change-context';
import { createLogisticsChange } from '@/lib/logistics-change-store';
import { readLogisticsChangeView } from '@/lib/logistics-change-view';
import { LOGISTICS_CHANGE_STATUSES } from '@/lib/logistics-change';
import { deliverSwitchEmail } from '@/lib/logistics-change-payment';

/** The longest "what the runner asked for" kept, a sentence or two. */
const MAX_REASON = 300;

type Body = {
  deliveryAddress?: unknown;
  deliveryZone?: unknown;
  deliverySplit?: unknown;
  reason?: unknown;
  paymentChoice?: unknown;
  transactionNumber?: unknown;
  proofFile?: unknown;
};

/** JSON from the panel, or a form when an already-paid switch carries its proof. */
async function readBody(request: Request): Promise<Body> {
  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    if (!form) return {};
    return {
      deliveryAddress: form.get('deliveryAddress') ?? undefined,
      deliveryZone: form.get('deliveryZone') || undefined,
      deliverySplit: form.get('deliverySplit') === 'true',
      reason: form.get('reason') ?? undefined,
      paymentChoice: form.get('paymentChoice') ?? undefined,
      transactionNumber: form.get('transactionNumber') ?? undefined,
      proofFile: form.get('proofFile') ?? undefined,
    };
  }
  return ((await request.json().catch(() => null)) ?? {}) as Body;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let unclaimedProof: string | null = null;
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findOrderReach(id);
    if (!reach || !can(actor, 'registration:edit', reach)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const body = await readBody(request);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length > MAX_REASON) {
      return NextResponse.json(
        { error: `Keep what the runner asked for to ${MAX_REASON} characters.`, field: 'reason' },
        { status: 400 },
      );
    }

    const choice = asChangePaymentChoice(body.paymentChoice);
    const paymentMethod = choice ? paymentMethodForChoice(choice) : null;
    if (choice && !paymentMethod) {
      return NextResponse.json(
        { error: 'Online payment is not offered right now. Choose GCash or bank transfer.', field: 'paymentChoice' },
        { status: 400 },
      );
    }

    let paidOutside: { transactionNumber: string; proofPathname: string | null } | null = null;
    if (choice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID) {
      if (!can(actor, 'registration:validate', reach)) {
        return NextResponse.json(
          { error: 'Recording a payment is not part of your role. Choose GCash or bank to come.', field: 'paymentChoice' },
          { status: 403 },
        );
      }
      const reference = readTransactionNumber(body.transactionNumber);
      if (reference.error || !reference.value) {
        return NextResponse.json({ error: reference.error, field: 'transactionNumber' }, { status: 400 });
      }
      // Uploaded before the switch exists, so the store can write it applied in
      // one transaction; deleted again below if anything refuses.
      if (body.proofFile instanceof File && body.proofFile.size > 0) {
        unclaimedProof = await uploadPrivateProof(body.proofFile);
      }
      paidOutside = { transactionNumber: reference.value, proofPathname: unclaimedProof };
    }

    const change = await createLogisticsChange(actor, {
      registrationId: id,
      target: {
        deliveryAddress: typeof body.deliveryAddress === 'string' ? body.deliveryAddress : null,
        deliveryZone: body.deliveryZone,
        deliverySplit: body.deliverySplit === true,
      },
      paymentMethod,
      reason,
      paidOutside,
    });
    unclaimedProof = null;

    // Already paid applies at once, so only the *switched* email goes out.
    const awaiting = change.status === LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT;
    const email = await deliverSwitchEmail(change.id, awaiting ? 'created' : 'applied', request.url).catch(error => {
      console.error('Delivery switch email failed:', error);
      return { sent: false as const, error: 'The email could not be prepared.', message: null };
    });
    return NextResponse.json({ change: await readLogisticsChangeView(change.id), email });
  } catch (error) {
    if (unclaimedProof) await deletePrivateFile(unclaimedProof).catch(() => undefined);
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, field: 'proofFile' }, { status: 400 });
    }
    if (error instanceof LogisticsChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Logistics change failed:', error);
    return NextResponse.json({ error: 'The order could not be switched. Try again.' }, { status: 500 });
  }
}
