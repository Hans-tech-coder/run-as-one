import { SignJWT, jwtVerify } from 'jose';
import { SECRET_KEY } from '@/lib/jwt';
import { PRICE_LOCK_GRACE_MINUTES, PRICE_LOCK_MINUTES } from '@/lib/price-lock-window';

/**
 * The price lock (PROMO_PRICE_LOCK_PLAN.md): **a runner keeps the promotions
 * that were running when they started the form, for 45 minutes.**
 *
 * Every promotion's date window is read off the clock at the moment it is
 * asked, so a group filling out a form as an early bird closed at midnight saw
 * one total and was charged another (Oct 18–19). The lock is the moment the
 * runner started, carried to the checkout so the server can price the order at
 * that moment as well as at now and give the better of the two
 * (`bestDiscountLocked` in promo-winner.ts).
 *
 * What it holds, and what it does not:
 *
 * - **A time, never a price.** The token's `iat` is `lockedAt`. Every amount
 *   is still recomputed on the server from the database, so a forged or
 *   replayed lock can at most ask for a moment we signed ourselves.
 * - **Only the date window.** Paused, usage limits, category seats and group
 *   size are the rows as they are at checkout. The lock reserves nothing.
 * - **One event.** The subject is the event id, and a checkout for any other
 *   event reads the token as no lock at all.
 * - **No renewal of an old moment.** A new lock is a new `lockedAt`; nothing
 *   here can stretch an old one.
 *
 * The runner is shown a 45-minute deadline (`expiresAt`); the token itself
 * lives 10 minutes past it, so a bank-transfer runner still uploading a slip
 * when the countdown reaches zero is not refused for it.
 *
 * Stateless, like the payment links in `resume-payment.ts`: a JWT signed with
 * the app's one secret, with its own `purpose` so no other token of ours reads
 * as a lock and a lock reads as nothing else. No row, so issuing one never
 * wakes the database.
 */

const PURPOSE = 'price-lock';

// The window lives in price-lock-window.ts so the wizards can read it without
// pulling the signing secret into a browser bundle.
export { PRICE_LOCK_MINUTES, PRICE_LOCK_GRACE_MINUTES };

const MINUTE_MS = 60_000;

export interface PriceLock {
  token: string;
  /** When the lock was taken — the moment whose promotions it keeps. */
  lockedAt: Date;
  /** The deadline the runner is shown. The token lasts a grace past it. */
  expiresAt: Date;
}

/** A new lock on this event's promotions, taken now. */
export async function createPriceLock(eventId: string): Promise<PriceLock> {
  // Whole seconds, because a JWT's `iat` is in seconds: the `lockedAt`
  // handed back is the one the token will read as.
  const lockedAtSeconds = Math.floor(Date.now() / 1000);
  const lockedAt = new Date(lockedAtSeconds * 1000);
  const token = await new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(eventId)
    .setIssuedAt(lockedAtSeconds)
    .setExpirationTime(lockedAtSeconds + (PRICE_LOCK_MINUTES + PRICE_LOCK_GRACE_MINUTES) * 60)
    .sign(SECRET_KEY);

  return {
    token,
    lockedAt,
    expiresAt: new Date(lockedAt.getTime() + PRICE_LOCK_MINUTES * MINUTE_MS),
  };
}

/**
 * When this lock was taken, or null for a forged or expired token, another
 * purpose's token, or one taken on a different event. Null is simply no lock:
 * the order is priced at now, as it was before locks existed.
 */
export async function readPriceLock(token: unknown, eventId: string): Promise<Date | null> {
  if (typeof token !== 'string' || !token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
    if (payload.purpose !== PURPOSE || payload.sub !== eventId) return null;
    if (typeof payload.iat !== 'number') return null;
    return new Date(payload.iat * 1000);
  } catch {
    return null;
  }
}

/**
 * One log line for an order the lock priced, written once the order exists.
 * The order itself stores the lock time (`Registration.priceLockedAt`, shown in
 * the registrant detail), which is what answers "why did a 12:20 AM order get
 * the early bird?" days later; this line adds both discounts, for as long as
 * the Vercel logs keep it (briefly, on Hobby). Ids, a time and centavos only —
 * no runner's name or address goes in a log.
 */
export function logHeldPrice(entry: {
  eventId: string;
  orderRef: string;
  lockedAt: Date;
  /** The discount the order got, under the lock. */
  lockedAmount: number;
  /** What it would have got at now. */
  nowAmount: number;
}): void {
  console.info(
    `Price lock held: order ${entry.orderRef}, event ${entry.eventId}, ` +
      `locked ${entry.lockedAt.toISOString()}, discount ${entry.lockedAmount} centavos ` +
      `(${entry.nowAmount} without the lock).`,
  );
}
