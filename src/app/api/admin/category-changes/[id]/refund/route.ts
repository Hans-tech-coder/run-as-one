/**
 * Recording that a downgrade's refund was paid (CATEGORY_CHANGE_PLAN.md D5):
 * REFUND_DUE → REFUNDED with the GCash or bank reference staff paid it under.
 * Refunds are paid by hand, never through PayMongo, so this is the only record
 * that the money went back. `registration:validate`, the permission that
 * settles an order's money, scoped to the change's own race; a refusal reads
 * like a missing change.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { CategoryChangeRefused, findChangeReachById } from '@/lib/category-change-context';
import { readRefundReference, recordCategoryChangeRefund } from '@/lib/category-change-store';
import { readCategoryChangeView } from '@/lib/category-change-view';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findChangeReachById(id);
    if (!reach || !can(actor, 'registration:validate', reach)) {
      return NextResponse.json({ error: 'Category change not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const reference = readRefundReference(body.reference);
    if (reference.error || !reference.value) {
      return NextResponse.json({ error: reference.error, field: 'reference' }, { status: 400 });
    }

    await recordCategoryChangeRefund(actor, id, reference.value);
    return NextResponse.json({ change: await readCategoryChangeView(id) });
  } catch (error) {
    if (error instanceof CategoryChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Category change refund failed:', error);
    return NextResponse.json({ error: 'The refund could not be recorded. Try again.' }, { status: 500 });
  }
}
