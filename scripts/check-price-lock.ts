import { SignJWT } from 'jose';
import { DISCOUNT_TYPES, categorySalePrices, promoCodeError, type OrderBasis, type PromoTerms } from '../src/lib/discount';
import { bestDiscount, bestDiscountLocked, lockChangedDiscount } from '../src/lib/promo-winner';
import { PRICE_CHANGED_MESSAGE, isPriceChanged, priceChangedBody } from '../src/lib/price-changed';

/**
 * A check of the price lock (PROMO_PRICE_LOCK_PLAN.md Batch 1): that an order
 * priced after a promotion ended still gets it when the runner started before
 * the end, that the lock never makes an order dearer, that it freezes only
 * the date window, and that the token reads back only for its own event and
 * only while it lasts.
 *
 * Batch 2 adds the checkout routes' glue that needs no database: a raw
 * `priceLock` as the routes receive it (a JSON field or a form field) reading
 * as a lock or as none, when an order counts as held by its lock and the line
 * it logs, and the shape of the "Prices have changed" 409.
 *
 * The Oct 18–19 shape: an early bird `CATEGORY_PRICE` ending at midnight
 * Manila and a combinable 5+1, a group of six that started at 23:50 and
 * submitted at 00:20.
 *
 * Pure arithmetic plus a token round trip, no database. Run it like the other
 * promo checks:
 *
 *   bash:
 *     JITI_ALIAS='{"@/":"'"$PWD"'/src/"}' npx jiti scripts/check-price-lock.ts
 *
 * It signs with `JWT_SECRET` from the environment, or a throwaway one when
 * that is unset; nothing it signs leaves the process.
 */

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}`,
    ok ? '' : `\n      got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`,
  );
}

/** A Manila wall-clock time (UTC+8, no daylight saving) as epoch ms. */
const manila = (iso: string) => new Date(`${iso}+08:00`).getTime();

const EARLY_BIRD_ENDS = new Date(manila('2026-10-18T23:59:59.999'));
const LOCKED_AT = manila('2026-10-18T23:50:00');
const NOW = manila('2026-10-19T00:20:00');

const TEN_K = 'cat-10k';

const base = {
  discountValue: 0,
  usageLimit: null,
  usageCount: 0,
  validFrom: null,
  validUntil: null,
  buyQuantity: null,
  getQuantity: null,
  automatic: true,
  combinable: true,
};

const earlyBird = (over: Partial<PromoTerms> = {}): PromoTerms => ({
  ...base,
  code: 'EARLY BIRD',
  discountType: DISCOUNT_TYPES.CATEGORY_PRICE,
  validUntil: EARLY_BIRD_ENDS,
  categoryPrices: [{ categoryId: TEN_K, price: 90_000, usageLimit: null, usageCount: 0 }],
  ...over,
});

const fivePlusOne: PromoTerms = {
  ...base,
  code: '5+1 FREE',
  discountType: DISCOUNT_TYPES.BUY_X_GET_Y,
  buyQuantity: 5,
  getQuantity: 1,
};

const tenK = { categoryId: TEN_K, listPrice: 120_000 };
const runnerPrices = Array(6).fill(tenK.listPrice);
const six: OrderBasis = {
  runnerPrices,
  runnerCategories: Array(6).fill(tenK),
  subtotal: runnerPrices.reduce((sum, p) => sum + p, 0),
};

/**
 * `bestDiscountLocked` reads "now" off the real clock, so the check moves it:
 * every call below happens at 00:20 Manila on Oct 19.
 */
function at<T>(moment: number, run: () => T): T {
  const realNow = Date.now;
  Date.now = () => moment;
  try {
    return run();
  } finally {
    Date.now = realNow;
  }
}

async function main() {
  // ── Locked at 23:50, priced at 00:20: still the combined discount ────────
  const held = at(NOW, () => bestDiscountLocked([earlyBird(), fivePlusOne], six, LOCKED_AT));
  check('locked: early bird leads', held?.code, 'EARLY BIRD');
  check('locked: the 5+1 rides along', held?.combined?.code, '5+1 FREE');
  check('locked: the group pays 5 × ₱900', six.subtotal - (held?.amount ?? 0), 450_000);

  // ── No lock at 00:20: today's price, the 5+1 alone ───────────────────────
  const today = at(NOW, () => bestDiscountLocked([earlyBird(), fivePlusOne], six, null));
  check('no lock: the 5+1 alone', today?.code, '5+1 FREE');
  check('no lock: nothing combined', today?.combined, null);
  check('no lock: the group pays 5 × ₱1,200', six.subtotal - (today?.amount ?? 0), 600_000);

  // ── The sale price list follows the same moment ──────────────────────────
  check(
    'sale prices at the lock: ₱900',
    categorySalePrices([earlyBird()], [{ id: TEN_K, price: 120_000 }], LOCKED_AT).get(TEN_K)?.salePrice,
    90_000,
  );
  check(
    'sale prices at now: none',
    at(NOW, () => categorySalePrices([earlyBird()], [{ id: TEN_K, price: 120_000 }]).size),
    0,
  );

  // ── A promotion that started after the lock still wins (best of both) ────
  const flashSale = earlyBird({
    code: 'MIDNIGHT SALE',
    validFrom: new Date(manila('2026-10-19T00:00:00')),
    validUntil: null,
    categoryPrices: [{ categoryId: TEN_K, price: 80_000, usageLimit: null, usageCount: 0 }],
  });
  const later = at(NOW, () => bestDiscountLocked([earlyBird(), flashSale, fivePlusOne], six, LOCKED_AT));
  check('started after the lock: the later, bigger sale wins', later?.code, 'MIDNIGHT SALE');
  check('started after the lock: pays 5 × ₱800', six.subtotal - (later?.amount ?? 0), 400_000);

  // ── The lock freezes the window only: paused or used up is refused ───────
  const paused = at(NOW, () => bestDiscountLocked([earlyBird({ paused: true }), fivePlusOne], six, LOCKED_AT));
  check('paused after the lock: the early bird is gone', paused?.code, '5+1 FREE');
  check('paused after the lock: nothing combined', paused?.combined, null);

  const usedUp = at(NOW, () =>
    bestDiscountLocked([earlyBird({ usageLimit: 10, usageCount: 10 }), fivePlusOne], six, LOCKED_AT),
  );
  check('used up after the lock: the early bird is gone', usedUp?.code, '5+1 FREE');

  const seatsGone = at(NOW, () =>
    bestDiscountLocked(
      [
        earlyBird({ categoryPrices: [{ categoryId: TEN_K, price: 90_000, usageLimit: 40, usageCount: 40 }] }),
        fivePlusOne,
      ],
      six,
      LOCKED_AT,
    ),
  );
  check('seats gone after the lock: the early bird is gone', seatsGone?.code, '5+1 FREE');

  // ── A typed code: the window at either moment, the row as it is ──────────
  const typed = earlyBird({ code: 'EARLY10', automatic: false });
  check(
    'typed code: expired at now',
    at(NOW, () => promoCodeError(typed, six, typed.code)),
    'EARLY10 expired on October 18, 2026.',
  );
  check('typed code: fine at the lock', promoCodeError(typed, six, typed.code, LOCKED_AT), null);

  // ── The token ────────────────────────────────────────────────────────────
  process.env.JWT_SECRET ??= 'check-price-lock-throwaway-secret';
  const { createPriceLock, readPriceLock, logHeldPrice, PRICE_LOCK_KEY, PRICE_LOCK_MINUTES, PRICE_LOCK_GRACE_MINUTES } =
    await import('../src/lib/price-lock');
  const { SECRET_KEY } = await import('../src/lib/jwt');

  const lock = await createPriceLock('event-a');
  check('constants: 45 minutes shown', PRICE_LOCK_MINUTES, 45);
  check('constants: 10 minutes of grace', PRICE_LOCK_GRACE_MINUTES, 10);
  check(
    'the shown deadline is 45 minutes on',
    lock.expiresAt.getTime() - lock.lockedAt.getTime(),
    45 * 60_000,
  );
  const read = await readPriceLock(lock.token, 'event-a');
  check('round trip: reads back its lockedAt', read?.getTime(), lock.lockedAt.getTime());
  check('foreign event: no lock', await readPriceLock(lock.token, 'event-b'), null);
  check('garbage: no lock', await readPriceLock('not-a-token', 'event-a'), null);
  check('missing: no lock', await readPriceLock(undefined, 'event-a'), null);

  const seconds = Math.floor(Date.now() / 1000);
  const expired = await new SignJWT({ purpose: 'price-lock' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('event-a')
    .setIssuedAt(seconds - 56 * 60)
    .setExpirationTime(seconds - 60)
    .sign(PRICE_LOCK_KEY);
  check('expired: no lock', await readPriceLock(expired, 'event-a'), null);

  const otherPurpose = await new SignJWT({ purpose: 'resume-payment' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('event-a')
    .setIssuedAt()
    .setExpirationTime(seconds + 600)
    .sign(SECRET_KEY);
  check('another purpose: no lock', await readPriceLock(otherPurpose, 'event-a'), null);

  const forged = await new SignJWT({ purpose: 'price-lock' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('event-a')
    .setIssuedAt()
    .setExpirationTime(seconds + 600)
    .sign(new TextEncoder().encode('somebody-elses-secret'));
  check('forged: no lock', await readPriceLock(forged, 'event-a'), null);

  // A lock has its own key: one signed with the session secret is not a lock,
  // and a lock does not verify as a session.
  const sessionKeyed = await new SignJWT({ purpose: 'price-lock' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('event-a')
    .setIssuedAt()
    .setExpirationTime(seconds + 600)
    .sign(SECRET_KEY);
  check('signed with the session key: no lock', await readPriceLock(sessionKeyed, 'event-a'), null);
  const { verifyToken } = await import('../src/lib/jwt');
  check('a lock is not a session', await verifyToken(lock.token), null);

  // Within the grace: past the shown 45 minutes, inside the 55.
  const inGrace = await new SignJWT({ purpose: 'price-lock' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('event-a')
    .setIssuedAt(seconds - 50 * 60)
    .setExpirationTime(seconds + 5 * 60)
    .sign(PRICE_LOCK_KEY);
  check('in the grace: still a lock', (await readPriceLock(inGrace, 'event-a'))?.getTime(), (seconds - 50 * 60) * 1000);

  // ── Batch 2: what the checkout routes hand readPriceLock ─────────────────
  // The online route reads a JSON field (absent, null, or anything a caller
  // typed); the bank-transfer route reads a form field (null, or a File if a
  // caller attached one under that name). All of it is simply no lock.
  check('route: absent JSON field is no lock', await readPriceLock(undefined, 'event-a'), null);
  check('route: null is no lock', await readPriceLock(null, 'event-a'), null);
  check('route: a number is no lock', await readPriceLock(1_760_000_000, 'event-a'), null);
  check('route: an object is no lock', await readPriceLock({ token: lock.token }, 'event-a'), null);
  check('route: empty string is no lock', await readPriceLock('', 'event-a'), null);
  check(
    'route: a file under that form name is no lock',
    await readPriceLock(new Blob([lock.token]), 'event-a'),
    null,
  );
  const form = new FormData();
  form.set('priceLock', lock.token);
  check(
    'route: the form field reads back as the lock',
    (await readPriceLock(form.get('priceLock'), 'event-a'))?.getTime(),
    lock.lockedAt.getTime(),
  );

  // ── Batch 2: when the order is logged as held by its lock ────────────────
  const nowOnly = at(NOW, () => bestDiscount([earlyBird(), fivePlusOne], six));
  check('held: the 23:50 lock changed the 00:20 discount', lockChangedDiscount(held, nowOnly), true);
  check('held: without a lock nothing changed', lockChangedDiscount(today, nowOnly), false);
  check('held: no discount at all is not held', lockChangedDiscount(null, null), false);
  check('held: only a lock-time discount counts as held', lockChangedDiscount(held, null), true);
  check(
    'held: a lock that gives the same as now changed nothing',
    lockChangedDiscount(
      at(NOW, () => bestDiscountLocked([fivePlusOne], six, LOCKED_AT)),
      at(NOW, () => bestDiscount([fivePlusOne], six)),
    ),
    false,
  );

  const logged: string[] = [];
  const realInfo = console.info;
  console.info = (line: string) => logged.push(line);
  try {
    logHeldPrice({
      eventId: 'event-a',
      orderRef: 'RAO-TEST1',
      lockedAt: new Date(LOCKED_AT),
      lockedAmount: held?.amount ?? 0,
      nowAmount: nowOnly?.amount ?? 0,
    });
  } finally {
    console.info = realInfo;
  }
  check('log: one line', logged.length, 1);
  check(
    'log: order, event, lock time and both amounts',
    logged[0],
    'Price lock held: order RAO-TEST1, event event-a, locked 2026-10-18T15:50:00.000Z, ' +
      `discount ${held?.amount} centavos (${nowOnly?.amount} without the lock).`,
  );

  // ── Batch 2: the "Prices have changed" 409 body ──────────────────────────
  check(
    '409: the sentence the wizards alert() is unchanged',
    PRICE_CHANGED_MESSAGE,
    'Prices have changed. Please reload the page and try again.',
  );
  check('409: before the promotions, no total', priceChangedBody({ subtotal: 720_000, deliveryFee: 15_000 }), {
    error: PRICE_CHANGED_MESSAGE,
    code: 'PRICE_CHANGED',
    subtotal: 720_000,
    deliveryFee: 15_000,
  });
  const full = priceChangedBody({
    subtotal: 720_000,
    deliveryFee: 0,
    discount: 120_000,
    platformFee: 30_000,
    transactionFee: 0,
    total: 630_000,
  });
  check('409: with every figure, the total', full.total, 630_000);
  check('409: the sentence rides along', full.error, PRICE_CHANGED_MESSAGE);
  check('409: reads as PRICE_CHANGED', isPriceChanged(full), true);
  check('409: a plain error does not', isPriceChanged({ error: 'Registration is closed.' }), false);
  check('409: nor does nothing', isPriceChanged(null), false);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
