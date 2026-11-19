import { STAFF_PAID_TO_REQUIRED, asPaidTo, channelOf, normalizePaidTo, staffPaidTo } from '../src/lib/payment-channel';
import { PAID_TO_REQUIRED, checkoutPaidTo } from '../src/lib/manual-checkout-form';

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

// checkoutPaidTo (manual-checkout-form.ts, Batch 2): what the runner's answer stores.
const refused = { ok: false, error: PAID_TO_REQUIRED };
same('checkout picks one of several', checkoutPaidTo('gcash', accounts), { ok: true, value: 'GCash' });
same('checkout stores the account spelling', checkoutPaidTo(' gotyme bank ', accounts), { ok: true, value: 'GoTyme Bank' });
same('checkout blank with several is refused', checkoutPaidTo('', accounts), refused);
same('checkout missing with several is refused', checkoutPaidTo(null, accounts), refused);
same('checkout unknown is refused', checkoutPaidTo('Maya', accounts), refused);
same('checkout blank with one is that one', checkoutPaidTo('  ', [{ bankName: 'GCash' }]), { ok: true, value: 'GCash' });
same('checkout unknown with one is refused', checkoutPaidTo('Maya', [{ bankName: 'GCash' }]), refused);
same('checkout with no accounts is refused', checkoutPaidTo('GCash', []), refused);

// staffPaidTo (Batch 3): what a staff-recorded payment stores.
const staffRefused = { ok: false, error: STAFF_PAID_TO_REQUIRED };
same('staff picks one of several', staffPaidTo('GCASH', accounts), { ok: true, value: 'GCash' });
same('staff blank with several is refused', staffPaidTo('', accounts), staffRefused);
same('staff unknown is refused', staffPaidTo('Maya', accounts), staffRefused);
same('staff blank with one is that one', staffPaidTo(null, [{ bankName: ' GCash ' }]), { ok: true, value: 'GCash' });
same('staff blank with none stays untagged', staffPaidTo('', []), { ok: true, value: null });
same('staff named with none is refused', staffPaidTo('GCash', []), staffRefused);

if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('payment channel checks passed.');
