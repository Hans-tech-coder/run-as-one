/**
 * Confirm on a delivery switch's link (`/pay/logistics/[token]`,
 * LOGISTICS_CHANGE_PLAN.md Revision 3 T2, T3): the runner saves where the kits
 * ship and who receives them, re-quoted under the switch locks by
 * `confirmSwitchDetails`. Answers the new figures. The fee is the order's own
 * tier, never ₱0: no address matches another order's parcel (the owner,
 * 2026-10-21), so this never applies a switch or moves an order.
 *
 * **Public, so rate-limited** (`PAY_LINK_RULE`), and it trusts nothing but the
 * signed token: the address and zone are posted as the wizard composes them,
 * and every figure is the server's.
 */

import { NextResponse } from 'next/server';
import { PAY_LINK_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { readSwitchPaymentToken } from '@/lib/resume-payment';
import { LogisticsChangeRefused } from '@/lib/logistics-change-context';
import { confirmSwitchDetails } from '@/lib/logistics-change-runner';

export async function POST(request: Request) {
  if (!allowRequest('switch-details', callerKey(request), PAY_LINK_RULE)) {
    return NextResponse.json({ error: 'Too many tries from this connection. Wait a minute, then try again.' }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    const changeId = token ? await readSwitchPaymentToken(token) : null;
    if (!changeId) {
      return NextResponse.json({ error: 'This link is not valid any more.' }, { status: 404 });
    }
    const deliveryAddress = typeof body?.deliveryAddress === 'string' ? body.deliveryAddress : null;
    const result = await confirmSwitchDetails(changeId, { deliveryAddress, deliveryZone: body?.deliveryZone });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LogisticsChangeRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Delivery switch details failed:', error);
    return NextResponse.json({ error: 'The delivery details could not be saved. Try again.' }, { status: 500 });
  }
}
