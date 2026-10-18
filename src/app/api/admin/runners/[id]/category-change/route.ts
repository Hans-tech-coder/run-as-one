/**
 * Moving one paid runner to another category (CATEGORY_CHANGE_PLAN.md,
 * Session 2). `registration:edit`, scoped to the runner's own race; a refusal
 * reads exactly like a missing runner, as on the runner edit route.
 *
 * - **`?preview=1`** writes nothing: the runner, the order's money, the
 *   event's change settings, every option with its seats, whether a change may
 *   be made, and — with `toCategoryId` — the server's own quote. The modal
 *   computes the live quote in the browser with the same `quoteCategoryChange`
 *   from these numbers.
 * - **Otherwise it makes the change**, recomputing every figure under the
 *   event lock (lib/category-change-store.ts). With nothing to pay — a lateral
 *   move, or a downgrade under either refund policy — it applies at once and
 *   the applied email goes out after the write commits; a send Resend refuses
 *   comes back with the rendered message for the by-hand send.
 * - **With something to pay** (Session 3) `paymentChoice` is required
 *   (lib/category-change-hold.ts): `ONLINE` opens it for a PayMongo payment
 *   with the transaction fee on top and emails the runner the payment link;
 *   `OUTSIDE_LATER` holds the seat for a GCash or bank payment and emails where
 *   to send it; `OUTSIDE_PAID` writes it the same way and sends nothing,
 *   because the modal records the payment next (`…/record-payment`), which
 *   applies it and sends the applied email.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { CATEGORY_CHANGE_STATUSES, readBasisAdjustment } from '@/lib/category-change';
import { CHANGE_PAYMENT_CHOICES, asChangePaymentChoice, paymentMethodForChoice } from '@/lib/category-change-hold';
import { deliverCreatedEmail } from '@/lib/category-change-payment';
import { CategoryChangeRefused, findChangeReach, previewCategoryChange } from '@/lib/category-change-context';
import { createCategoryChange } from '@/lib/category-change-store';
import { deliverAppliedEmail, readCategoryChangeView } from '@/lib/category-change-view';
import db from '@/lib/db';

/** The longest "what the runner asked for" kept, a sentence or two. */
const MAX_REASON = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findChangeReach(id);
    if (!reach || !can(actor, 'registration:edit', reach)) {
      return NextResponse.json({ error: 'Runner not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const toCategoryId = typeof body.toCategoryId === 'string' && body.toCategoryId ? body.toCategoryId : null;
    const adjustment = readBasisAdjustment(body.basis, body.basisReason);
    const preview = new URL(request.url).searchParams.get('preview') === '1';

    if (preview) {
      // A half-typed adjustment previews as no adjustment rather than failing:
      // the modal shows its own field error while staff are still typing.
      return NextResponse.json(
        await previewCategoryChange({ runnerId: id, toCategoryId, basisAdjustment: adjustment.value }),
      );
    }

    if (!toCategoryId) {
      return NextResponse.json({ error: 'Choose the category to move this runner to.', field: 'toCategoryId' }, { status: 400 });
    }
    if (adjustment.error) {
      return NextResponse.json({ error: adjustment.error, field: 'basis' }, { status: 400 });
    }
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

    const change = await createCategoryChange(actor, {
      runnerId: id,
      toCategoryId,
      reason,
      basisAdjustment: adjustment.value,
      paymentMethod,
    });

    const awaiting = change.status === CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT;
    const failed = (error: unknown) => {
      console.error('Category change email failed:', error);
      return { sent: false as const, error: 'The email could not be prepared.', message: null };
    };
    // Already paid: the record that follows applies it and sends the applied
    // email, so the runner is not told to pay what they paid.
    const email =
      awaiting && choice === CHANGE_PAYMENT_CHOICES.OUTSIDE_PAID
        ? null
        : awaiting
          ? await deliverCreatedEmail(change.id, request.url).catch(failed)
          : await deliverAppliedEmail(change.id).catch(failed);
    const category = await db.category.findUnique({
      where: { id: change.toCategoryId },
      select: { id: true, name: true, distance: true },
    });

    return NextResponse.json({
      change: await readCategoryChangeView(change.id),
      // The runner stays where they are until an upgrade is paid.
      category: awaiting ? null : category,
      email,
      emailKind: awaiting ? 'created' : 'applied',
    });
  } catch (error) {
    if (error instanceof CategoryChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Category change failed:', error);
    return NextResponse.json({ error: 'The category could not be changed. Try again.' }, { status: 500 });
  }
}
