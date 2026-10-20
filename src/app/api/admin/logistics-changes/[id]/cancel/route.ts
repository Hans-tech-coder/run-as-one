/**
 * Withdrawing a switch to delivery that is still waiting for its fee
 * (LOGISTICS_CHANGE_PLAN.md Session 2): the runner changed their mind, or
 * staff opened the wrong switch. AWAITING_PAYMENT → CANCELLED; its orders
 * never moved, so they stay as they are. Its PayMongo page, if one was opened,
 * is closed after the write, so the link stops taking money
 * (lib/logistics-change-payment.ts).
 *
 * `registration:edit`, the permission that opened it, scoped to the switch's
 * own race; a refusal reads like a missing switch. Nobody is emailed. Answers
 * with the switch, as the route that opened it does; the registrants screen
 * it was pressed on refreshes itself.
 */

import { NextResponse } from 'next/server';
import { can, getActor } from '@/lib/actor';
import { LogisticsChangeRefused, findSwitchReach } from '@/lib/logistics-change-context';
import { cancelLogisticsChange } from '@/lib/logistics-change-store';
import { retireSwitchPage } from '@/lib/logistics-change-payment';
import { readLogisticsChangeView } from '@/lib/logistics-change-view';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reach = await findSwitchReach(id);
    if (!reach || !can(actor, 'registration:edit', reach)) {
      return NextResponse.json({ error: 'Delivery switch not found' }, { status: 404 });
    }

    const cancelled = await cancelLogisticsChange(actor, id);
    await retireSwitchPage(cancelled);
    return NextResponse.json({ change: await readLogisticsChangeView(id) });
  } catch (error) {
    if (error instanceof LogisticsChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Logistics change cancel failed:', error);
    return NextResponse.json({ error: 'The switch could not be cancelled. Try again.' }, { status: 500 });
  }
}
