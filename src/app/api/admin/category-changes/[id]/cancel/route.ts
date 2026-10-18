/**
 * Withdrawing an upgrade that is still waiting for its payment
 * (CATEGORY_CHANGE_PLAN.md Session 3): the runner changed their mind, or staff
 * opened the wrong move. AWAITING_PAYMENT → CANCELLED, which releases the seat
 * it held in the target category by the status alone (lib/slot-holds.ts); the
 * runner stays where they are. Its PayMongo page is closed after the write, so
 * the link stops taking money (lib/category-change-payment.ts).
 *
 * `registration:edit`, the permission that opened it, scoped to the change's
 * own race; a refusal reads like a missing change. Nobody is emailed: the
 * runner who asked to stay is told by staff in the chat they asked in.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { CategoryChangeRefused, findChangeReachById } from '@/lib/category-change-context';
import { cancelCategoryChange } from '@/lib/category-change-store';
import { retireChangePage } from '@/lib/category-change-payment';
import { readCategoryChangeView } from '@/lib/category-change-view';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findChangeReachById(id);
    if (!reach || !can(actor, 'registration:edit', reach)) {
      return NextResponse.json({ error: 'Category change not found' }, { status: 404 });
    }

    const cancelled = await cancelCategoryChange(actor, id);
    await retireChangePage(cancelled);
    return NextResponse.json({ change: await readCategoryChangeView(id) });
  } catch (error) {
    if (error instanceof CategoryChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Category change cancel failed:', error);
    return NextResponse.json({ error: 'The change could not be cancelled. Try again.' }, { status: 500 });
  }
}
