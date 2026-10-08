/**
 * What a client viewer is shown about the money for one of its races
 * (CLIENT_RACE_PAGE_PLAN.md, Batch 3, decision D1): **a payout summary and
 * nothing more.**
 *
 * Five figures — what runners paid, Run As One's fees, the payment processing
 * fees (PayMongo's cut, never called Run As One's and never named to a client —
 * *payment processing* is all a client needs), what has been paid out to the
 * organizer, and what is still owed — and the payouts themselves, each
 * as a day, a method and an amount. The figures are `settlement-store.ts`'s
 * own sums (`totalsByEvent`), so a client reads the very numbers staff settle
 * by on Remittances and the two can never disagree.
 *
 * **Left out on purpose**, and absent from the shapes returned so the page
 * cannot render them: reference numbers, notes, receipts, voided rows, who
 * recorded a payout, and any per-order or per-price breakdown. A client
 * cannot act on them, and a reference number is the bank's, not theirs.
 *
 * A **return** (the organizer paying money back after a refund left it
 * overpaid) is listed beside the payouts as a negative amount, because it is
 * already netted into *Paid out*: leaving it off would make the list fail to
 * add up to the figure above it.
 *
 * Gated by `event:view-payout`: the race is read through
 * `reachableEvents` and `can()` is asked with its own `clientId`, as
 * `client-summary.ts` does for counts. A race the actor may not see — or may
 * see the counts of but not the money, like a per-event staff member — is
 * `null`, and the page simply has no payout section.
 *
 * Server-only.
 */

import prisma from './db';
import { can, reachableEvents, type Actor } from './actor';
import { totalsByEvent } from './settlement-store';
import { asRemittanceKind, remittanceMethodLabel, type SettlementState } from './settlement';

/** One payout (or return) as a client sees it: when, how, how much. */
export type ClientPayoutRow = {
  /** YYYY-MM-DD in Manila: the day the money moved. */
  paidOn: string;
  /** "Bank Transfer", "GCash", … */
  method: string;
  /** Centavos, positive. */
  amount: number;
  /** Money the organizer sent back to Run As One, not a payout to it. */
  isReturn: boolean;
};

export type ClientPayout = {
  /** Everything runners paid on confirmed (PAID) orders. */
  collected: number;
  /** Run As One's platform fees on those orders. */
  fees: number;
  /** The payment processor's cut on those orders (the transaction fee). Not Run As One's. */
  processingFees: number;
  /** Payouts less returns, voided rows left out. */
  paidOut: number;
  /** What is owed less what was paid out. Negative when overpaid. */
  stillOwed: number;
  state: SettlementState;
  /** Latest first. */
  payouts: ClientPayoutRow[];
};

export async function clientPayout(actor: Actor, eventId: string): Promise<ClientPayout | null> {
  const event = await prisma.event.findFirst({
    where: { AND: [reachableEvents(actor, 'event:view-payout'), { id: eventId }] },
    select: { id: true, organizerId: true, clientId: true },
  });
  if (
    !event ||
    !can(actor, 'event:view-payout', { organizerId: event.organizerId, eventId: event.id, clientId: event.clientId })
  ) {
    return null;
  }

  const [settlementOf, rows] = await Promise.all([
    totalsByEvent([event.id]),
    prisma.remittance.findMany({
      where: { eventId: event.id, status: 'RECORDED' },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      // The whitelist. Nothing else about a remittance leaves this query.
      select: { kind: true, amount: true, paidOn: true, method: true },
    }),
  ]);

  const settlement = settlementOf(event.id);
  return {
    collected: settlement.collected,
    fees: settlement.platformFees,
    processingFees: settlement.transactionFees,
    paidOut: settlement.remitted,
    stillOwed: settlement.balance,
    state: settlement.state,
    payouts: rows.map(row => ({
      paidOn: row.paidOn,
      method: remittanceMethodLabel(row.method),
      amount: row.amount,
      isReturn: asRemittanceKind(row.kind) === 'RETURN',
    })),
  };
}
