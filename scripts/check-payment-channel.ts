import { asPaidTo, channelOf, normalizePaidTo } from '../src/lib/payment-channel';

/**
 * A check of `src/lib/payment-channel.ts` (PAYMENT_CHANNELS_PLAN.md D1, D4).
 * Touches no database, like `check-refund.ts`.
 *
 *   PowerShell:
 *     $env:JITI_ALIAS='{"@/":"C:/Users/user/Web Projects/run-as-one/src/"}'
 *     npx jiti scripts/check-payment-channel.ts
 *
 * Exits non-zero if anything disagrees.
 */

let failures = 0;
function same(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) return;
  failures++;
  console.error(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// normalizePaidTo: one key per wallet, however it is typed.
same('normalize trims and lowercases', normalizePaidTo('  GCash '), 'gcash');
same('normalize collapses inner spaces', normalizePaidTo('Go  Tyme\tBank'), 'go tyme bank');
same('normalize blank', normalizePaidTo('   '), '');
same('normalize non-string', normalizePaidTo(42), '');
same('normalize null', normalizePaidTo(null), '');

// asPaidTo: only the event's own accounts, in the account's spelling.
const accounts = [{ bankName: 'GCash' }, { bankName: 'GoTyme  Bank' }];
same('asPaidTo exact', asPaidTo('GCash', accounts), 'GCash');
same('asPaidTo case and spaces', asPaidTo('  gcash ', accounts), 'GCash');
same('asPaidTo returns account spelling, tidied', asPaidTo('gotyme bank', accounts), 'GoTyme Bank');
same('asPaidTo unknown account', asPaidTo('Maya', accounts), null);
same('asPaidTo blank', asPaidTo('  ', accounts), null);
same('asPaidTo non-string', asPaidTo({ bankName: 'GCash' }, accounts), null);
same('asPaidTo no accounts', asPaidTo('GCash', []), null);

// channelOf: decided by paymentMethod, never by the word "GCash".
const key = (row: Parameters<typeof channelOf>[0]) => channelOf(row)?.key ?? null;
same('PayMongo GCASH is PayMongo, not the wallet', channelOf({ paymentMethod: 'GCASH', paidTo: 'GCash' }), {
  kind: 'PAYMONGO', key: 'paymongo', label: 'PayMongo',
});
same('CARD is PayMongo', key({ paymentMethod: 'CARD', paidTo: null }), 'paymongo');
same('MAYA is PayMongo', key({ paymentMethod: 'MAYA', paidTo: null }), 'paymongo');
same('legacy "online" default is PayMongo', key({ paymentMethod: 'online', paidTo: null }), 'paymongo');
same('bank transfer to GCash wallet', channelOf({ paymentMethod: 'BANK_TRANSFER', paidTo: 'GCash' }), {
  kind: 'ACCOUNT', key: 'account:gcash', label: 'GCash',
});
same('wallet spellings group together',
  key({ paymentMethod: 'bank_transfer', paidTo: ' gcash ' }),
  key({ paymentMethod: 'BANK_TRANSFER', paidTo: 'GCASH' }));
same('bank transfer, null paidTo is Untagged', channelOf({ paymentMethod: 'BANK_TRANSFER', paidTo: null }), {
  kind: 'UNTAGGED', key: 'untagged', label: 'Untagged',
});
same('bank transfer, blank paidTo is Untagged', key({ paymentMethod: 'BANK_TRANSFER', paidTo: '  ' }), 'untagged');
same('account named "untagged" stays an account', key({ paymentMethod: 'BANK_TRANSFER', paidTo: 'Untagged' }), 'account:untagged');
same('complimentary has no channel', channelOf({ paymentMethod: 'COMPLIMENTARY', paidTo: null }), null);
same('no method has no channel', channelOf({ paymentMethod: null, paidTo: 'GCash' }), null);
same('blank method has no channel', channelOf({ paymentMethod: '  ', paidTo: null }), null);

if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('payment channel checks passed.');
