/**
 * **Where one race's money came in, by channel** (PAYMENT_CHANNELS_PLAN.md
 * Batch 4): each bank-transfer account by name, PayMongo, and *Untagged*, so
 * remitting to the organizer needs no hand math. Prisma-free, so the check
 * script folds fixtures through the very function the page uses; the grouped
 * queries that feed it are in `settlement-store.ts`.
 *
 * The rules, the owner's answers (2026-11-19):
 *   - **Only money settlement counts is listed** — PAID orders, moved category
 *     changes (the `MOVED_CHANGE_STATUSES`) and APPLIED delivery switches that
 *     charged something, each only while its order is PAID — and each row's
 *     channel is `channelOf` (D4): by `paymentMethod`, never by the word
 *     "GCash", so PayMongo's GCash is PayMongo. Accounts group by normalized
 *     name (D1). A complimentary order has no channel and is never listed.
 *   - **Gross is what came in; fees are PayMongo's transaction fees**, on the
 *     PayMongo channel only; net is gross less fees.
 *   - **Refunds are a line of their own (D5)**, never taken off a channel:
 *     runner refunds plus category-change downgrade refunds, the very figures
 *     `settle()` takes off collected.
 *   - **Awaiting validation is shown apart (D6)** and is in no total: a bank
 *     transfer order still PENDING, an upgrade or a switch AWAITING_PAYMENT
 *     with proof sent.
 *   - **It ties to settlement (D7)**: Σ gross = orders + changes charged +
 *     switches charged, so Σ gross − refunds = settlement's `collected`.
 *     `tiesOut` says whether it does; `settlement.ts` is untouched and stays
 *     the authority on what is owed.
 */

import { channelOf, type PaymentChannel } from './payment-channel';
import type { Settlement } from './settlement';

/** One grouped row from a query: a method, an account, how many and how much. */
export type ChannelGroup = {
  paymentMethod: string | null;
  paidTo: string | null;
  count: number;
  /** What came in: `totalAmount` on an order, `totalCharged` on a change. */
  gross: number;
  /** PayMongo's transaction fee inside `gross`. */
  transactionFees: number;
};

export type ChannelLine = {
  channel: PaymentChannel;
  count: number;
  gross: number;
  /** PayMongo's transaction fees; 0 on every other channel. */
  fees: number;
  net: number;
};

export type AwaitingLine = { channel: PaymentChannel; count: number; amount: number };

export type ChannelBreakdown = {
  /** Accounts by name (A→Z), then PayMongo, then Untagged; empty channels left out. */
  lines: ChannelLine[];
  gross: number;
  fees: number;
  /** Runner refunds and downgrade refunds, paid or still due (D5). */
  refunds: number;
  /** Σ gross − refunds: equal to settlement's `collected` when `tiesOut`. */
  collected: number;
  tiesOut: boolean;
  /** Bank transfers sent but not validated, by channel; in no total (D6). */
  awaiting: AwaitingLine[];
  awaitingAmount: number;
};

const ORDER: Record<PaymentChannel['kind'], number> = { ACCOUNT: 0, PAYMONGO: 1, UNTAGGED: 2 };

function byChannel(a: { channel: PaymentChannel }, b: { channel: PaymentChannel }): number {
  return ORDER[a.channel.kind] - ORDER[b.channel.kind] || a.channel.label.localeCompare(b.channel.label);
}

/**
 * Folds the paid groups and the awaiting groups into the breakdown. `paid`
 * is every counted row (orders, moved changes, applied switches) and
 * `awaiting` every unvalidated bank transfer; `settlement` is the race's own
 * figures, read only for the refund line and the tie-out.
 */
export function channelBreakdown(
  paid: readonly ChannelGroup[],
  awaiting: readonly ChannelGroup[],
  settlement: Pick<Settlement, 'collected' | 'refunds' | 'changes'>,
): ChannelBreakdown {
  const lines = new Map<string, ChannelLine>();
  for (const group of paid) {
    const channel = channelOf(group);
    // A complimentary order or a ₱0 downgrade: no channel, and nothing came in.
    // A row with money and no method cannot happen (every paid row records how
    // it was paid); if one did, the tie-out below would say so.
    if (!channel) continue;
    const line = lines.get(channel.key) ?? { channel, count: 0, gross: 0, fees: 0, net: 0 };
    const fees = channel.kind === 'PAYMONGO' ? group.transactionFees : 0;
    line.count += group.count;
    line.gross += group.gross;
    line.fees += fees;
    line.net += group.gross - fees;
    lines.set(channel.key, line);
  }

  const waiting = new Map<string, AwaitingLine>();
  for (const group of awaiting) {
    const channel = channelOf(group);
    // Only a bank transfer waits on a person; PayMongo confirms itself.
    if (!channel || channel.kind === 'PAYMONGO') continue;
    const line = waiting.get(channel.key) ?? { channel, count: 0, amount: 0 };
    line.count += group.count;
    line.amount += group.gross;
    waiting.set(channel.key, line);
  }

  const sorted = [...lines.values()].filter(line => line.count > 0).sort(byChannel);
  const gross = sorted.reduce((sum, line) => sum + line.gross, 0);
  const fees = sorted.reduce((sum, line) => sum + line.fees, 0);
  const refunds = settlement.refunds.amount + settlement.changes.refunded + settlement.changes.toRefund;
  const collected = gross - refunds;
  const awaitingLines = [...waiting.values()].filter(line => line.count > 0).sort(byChannel);

  return {
    lines: sorted,
    gross,
    fees,
    refunds,
    collected,
    tiesOut: collected === settlement.collected,
    awaiting: awaitingLines,
    awaitingAmount: awaitingLines.reduce((sum, line) => sum + line.amount, 0),
  };
}
