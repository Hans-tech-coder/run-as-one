/**
 * Generating a batch of single-use voucher codes.
 *
 * A voucher is read off a printed card or a chat message and typed into a
 * phone, so the alphabet leaves out every character that can be mistaken for
 * another one: no O against 0, no I or L against 1, no S against 5, no U
 * against V. That costs a little entropy per character and buys back every
 * support message that begins "it says the code doesn't exist".
 *
 * Codes are random rather than sequential. SUMMER-001 through SUMMER-200 hands
 * anyone who receives one the other hundred and ninety-nine, which for a
 * single-use voucher is the whole promotion given away.
 */

/** No O/0, I/1, L, S/5, U/V — see above. 27 characters, ~4.75 bits each. */
const ALPHABET = 'ABCDEFGHJKMNPQRTWXYZ2346789';

/** Characters in the random half of a code. 27^7 is far past a batch of 500. */
const CODE_LENGTH = 7;

/**
 * The most vouchers one batch may create.
 *
 * A generous ceiling for a race and a deliberate one for the database: the
 * platform runs on Neon's free 0.5 GB tier, and a row per voucher is cheap
 * only while nobody generates a hundred thousand of them by holding down a
 * key in the count field.
 */
export const MAX_VOUCHER_BATCH = 500;

/**
 * `count` distinct codes, optionally carrying a prefix the organizer chose so
 * a runner quoting one can be placed at a glance ("SUMMER-K7QMX2P").
 *
 * Distinctness is enforced here as well as by the unique index, because the
 * insert is one `createMany`: two identical codes inside the same batch would
 * be dropped by `skipDuplicates` and the organizer would silently receive
 * fewer vouchers than they asked for.
 */
export function newVoucherCodes(prefix: string, count: number): string[] {
  const head = prefix ? `${prefix}-` : '';
  const codes = new Set<string>();

  // Bounded rather than a bare while: a broken alphabet or a zero-length code
  // would otherwise spin forever inside a request handler.
  const ceiling = count * 20;
  for (let attempt = 0; codes.size < count && attempt < ceiling; attempt++) {
    codes.add(head + randomBlock(CODE_LENGTH));
  }

  return [...codes];
}

/**
 * Web Crypto, not `Math.random` and not node's `crypto`. A predictable voucher
 * is a voucher anyone can mint, and the Web API keeps this module importable
 * from anywhere in the app — the same call `order-ref.ts` makes for the same
 * reason.
 */
function randomBlock(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (const byte of bytes) {
    // Modulo bias across 27 letters of a 256-value byte is a fraction of a
    // percent per character, which matters for a key and not for a coupon
    // nobody is guessing one character at a time.
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}
