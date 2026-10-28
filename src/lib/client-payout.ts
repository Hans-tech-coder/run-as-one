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
 * **Category changes** (CATEGORY_CHANGE_PLAN.md) are already inside the five
 * figures — an upgrade's payment in *Collected*, its change fee in *Run As
 * One fees*, a downgrade's refund taken off — so the line that names them is
 * an explanation, not a sixth figure: how many runners moved, what their
 * changes came to in *Collected*, and any refund still owed to a runner. No
 * per-runner amount, the same rule as the orders.
 *
 * **Delivery switches** (LOGISTICS_CHANGE_PLAN.md L8) are inside the figures
 * the same way — what a paid switch charged in *Collected*, its PayMongo cut
 * in *Payment processing fees* — and get the same kind of line: how many
 * receipts switched to delivery for a fee, and what those fees add to what the
 * client is owed, which is the whole fee. No per-receipt amount.
 *
 * **Add-ons** (ADD_ONS_PLAN.md D1) are split by who sold them. The client's
 * own (sold by the organizer) are inside *Collected* and owed to it, and get a
 * line like the two above: what runners paid for its add-ons. **Run As One's
 * own add-on sales are not part of the client's payout at all** — Run As One
 * sold them and keeps them — so they are taken out of *Collected* here, which
 * keeps the five figures adding up (*Collected* less the two fees is what is
 * owed) without naming a sale that is none of the client's money. Only a flag
 * says *Collected* left something out, so the note under it stays true.
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
  /** Everything runners paid on confirmed (PAID) orders, Run As One's own add-on sales aside. */
  collected: number;
  /** Whether *Collected* left out add-ons Run As One sold, so its note can say so (no amount). */
  leavesOutRunAsOneAddOns: boolean;
  /** Run As One's platform fees on those orders. */
  fees: number;
  /** The payment processor's cut on those orders (the transaction fee). Not Run As One's. */
  processingFees: number;
  /** Payouts less returns, voided rows left out. */
  paidOut: number;
  /** What is owed less what was paid out. Negative when overpaid. */
  stillOwed: number;
  state: SettlementState;
  /** The Category changes line; null when no runner of this race has moved. */
  categoryChanges: {
    /** Changes in which the runner moved. */
    count: number;
    /** What they add to *Collected*: upgrades paid less downgrade refunds. Negative when refunds win. */
    collected: number;
    /** Downgrade refunds Run As One still owes runners, already taken off *Collected*. */
    toRefund: number;
    /** Change fees inside *Run As One fees*, so the tile can say they are there. */
    changeFees: number;
  } | null;
  /** The Delivery switches line; null when no receipt of this race paid to switch to delivery. */
  deliverySwitches: {
    /** Paid switches, one receipt each. */
    count: number;
    /** What their fees add to what the client is owed: the delivery fees, all the client's. */
    fees: number;
  } | null;
  /** The Add-ons line: the client's own add-on sales, inside *Collected* and owed; null when it sold none. */
  addOns: { sales: number } | null;
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
    // Run As One's own add-on sales are its, not the client's (D1): out of
    // Collected, so Collected less the two fees is still what is owed.
    collected: settlement.collected - settlement.addOns.runAsOne,
    leavesOutRunAsOneAddOns: settlement.addOns.runAsOne > 0,
    fees: settlement.platformFees,
    processingFees: settlement.transactionFees,
    paidOut: settlement.remitted,
    stillOwed: settlement.balance,
    state: settlement.state,
    categoryChanges:
      settlement.changes.changes > 0
        ? {
            count: settlement.changes.changes,
            collected: settlement.changes.collected,
            toRefund: settlement.changes.toRefund,
            changeFees: settlement.changes.changeFees,
          }
        : null,
    deliverySwitches:
      settlement.switches.switches > 0
        ? { count: settlement.switches.switches, fees: settlement.switches.owed }
        : null,
    addOns: settlement.addOns.organizer > 0 ? { sales: settlement.addOns.organizer } : null,
    payouts: rows.map(row => ({
      paidOn: row.paidOn,
      method: remittanceMethodLabel(row.method),
      amount: row.amount,
      isReturn: asRemittanceKind(row.kind) === 'RETURN',
    })),
  };
}
