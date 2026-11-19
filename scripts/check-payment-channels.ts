import { channelBreakdown, type ChannelGroup } from '../src/lib/settlement-channels';
import { NO_REFUNDS, settle } from '../src/lib/settlement';

/**
 * A check of `src/lib/settlement-channels.ts` (PAYMENT_CHANNELS_PLAN.md
 * Batch 4): the per-channel breakdown ties to `settle()` (D7), PayMongo's
 * GCash is PayMongo and never the GCash wallet (D4), refunds are a line of
 * their own (D5) and awaiting validation is in no total (D6). Touches no
 * database, like `check-refund.ts`.
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-payment-channels.ts
 *
 * Exits non-zero if anything disagrees.
 */

let failures = 0;
function same(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) return;
  failures++;
  console.error(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const group = (paymentMethod: string | null, paidTo: string | null, count: number, gross: number, transactionFees = 0): ChannelGroup => ({
  paymentMethod,
  paidTo,
  count,
  gross,
  transactionFees,
});

// One race, in centavos. Orders: GCash wallet ×3 (two spellings of one
// name), GoTyme ×1, untagged ×1, PayMongo card ×1 and PayMongo GCash ×2, a
// complimentary pacer. An upgrade paid into GoTyme, a switch through PayMongo.
const orderGroups = [
  group('BANK_TRANSFER', 'GCash', 2, 200_000),
  group('BANK_TRANSFER', ' gcash ', 1, 100_000),
  group('BANK_TRANSFER', 'GoTyme Bank', 1, 100_000),
  group('BANK_TRANSFER', null, 1, 100_000),
  group('CARD', null, 1, 103_500, 3_500),
  group('GCASH', null, 2, 205_000, 5_000),
  group('online', null, 0, 0),
  group('COMPLIMENTARY', null, 1, 0),
];
const changeGroups = [group('BANK_TRANSFER', 'GoTyme Bank', 1, 50_000), group(null, null, 1, 0)];
const switchGroups = [group('GCASH', null, 1, 10_250, 250)];
const paid = [...orderGroups, ...changeGroups, ...switchGroups];

const sum = (groups: ChannelGroup[], key: 'gross' | 'transactionFees' | 'count') =>
  groups.reduce((total, row) => total + row[key], 0);

const settlement = settle(
  {
    paidOrders: sum(orderGroups, 'count'),
    collected: sum(orderGroups, 'gross'),
    platformFees: 9 * 6_000,
    transactionFees: sum(orderGroups, 'transactionFees'),
    addOnSales: 0,
    runAsOneAddOns: 0,
  },
  0,
  // The upgrade and a downgrade refund still to pay (₱300).
  { changes: 2, charged: 50_000, changeFees: 2 * 5_000, transactionFees: 0, refunded: 0, toRefund: 30_000 },
  { switches: 1, charged: 10_250, fees: 10_000, transactionFees: 250 },
  // A runner refund paid (₱1,000).
  { ...NO_REFUNDS, refunds: 1, amount: 100_000 },
);

const awaiting = [
  group('BANK_TRANSFER', 'GCash', 2, 200_000),
  group('BANK_TRANSFER', null, 1, 50_000),
  // A PayMongo row never waits on a person, so it is not listed.
  group('CARD', null, 1, 99_999),
];

const breakdown = channelBreakdown(paid, awaiting, settlement);
const byLabel = Object.fromEntries(breakdown.lines.map(line => [line.channel.label, line]));

// D7: Σ gross = orders + changes charged + switches charged.
same('gross ties to the three money lines', breakdown.gross, sum(orderGroups, 'gross') + 50_000 + 10_250);
same('gross less refunds is settlement collected', breakdown.collected, settlement.collected);
same('tiesOut', breakdown.tiesOut, true);
// D5: refunds are runner refunds plus downgrade refunds, on no channel.
same('refund line', breakdown.refunds, 100_000 + 30_000);

// D1, D4: one line per wallet name, PayMongo, Untagged, in that order.
same('channel order', breakdown.lines.map(line => line.channel.label), ['GCash', 'GoTyme Bank', 'PayMongo', 'Untagged']);
same('GCash wallet groups both spellings', [byLabel.GCash.count, byLabel.GCash.gross], [3, 300_000]);
same('GoTyme takes the upgrade', [byLabel['GoTyme Bank'].count, byLabel['GoTyme Bank'].gross], [2, 150_000]);
// PayMongo's GCash is PayMongo, never the GCash wallet.
same(
  'PayMongo-GCash is PayMongo',
  [byLabel.PayMongo.count, byLabel.PayMongo.gross, byLabel.PayMongo.fees, byLabel.PayMongo.net],
  [4, 318_750, 8_750, 310_000],
);
same('fees only on PayMongo', breakdown.fees, 8_750);
same('a wallet has no fee', [byLabel.GCash.fees, byLabel.GCash.net], [0, 300_000]);
same('untagged', [byLabel.Untagged.count, byLabel.Untagged.gross], [1, 100_000]);
same('complimentary is never listed', breakdown.lines.some(line => line.count === 0), false);

// D6: awaiting validation by channel, bank transfers only, in no total.
same('awaiting lines', breakdown.awaiting.map(line => [line.channel.label, line.count, line.amount]), [
  ['GCash', 2, 200_000],
  ['Untagged', 1, 50_000],
]);
same('awaiting amount', breakdown.awaitingAmount, 250_000);
same('awaiting stays out of gross', breakdown.gross, 868_750);

// An untied breakdown says so rather than passing quietly.
same('a mismatch reads untied', channelBreakdown(paid, [], { ...settlement, collected: settlement.collected + 1 }).tiesOut, false);

// An empty race.
const empty = channelBreakdown([], [], settle({ paidOrders: 0, collected: 0, platformFees: 0, transactionFees: 0, addOnSales: 0, runAsOneAddOns: 0 }, 0));
same('empty race', [empty.lines.length, empty.gross, empty.refunds, empty.tiesOut], [0, 0, 0, true]);

if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('payment channels breakdown checks passed.');
