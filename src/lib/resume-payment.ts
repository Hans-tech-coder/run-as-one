import { SignJWT, jwtVerify } from 'jose';
import { SECRET_KEY } from '@/lib/jwt';
import { isPayMongoMethod } from '@/lib/free-checkout';
import { expiresBy } from '@/lib/pending-expiry';

/**
 * The resume-payment link (UNPAID_FOLLOWUP_PLAN.md Batch 3): a URL staff hand
 * to a runner whose online checkout was never paid, so they can finish paying
 * without registering again. Today the PayMongo page dies with the browser tab.
 *
 * **The token is stateless.** A JWT signed with the app's one secret
 * (lib/jwt.ts), carrying the order's id and `purpose: 'resume-payment'`, and
 * expiring when the order lets go of its slot (`expiresBy`). No column stores it, so there is nothing to
 * revoke by hand — and nothing needs to be: the link is checked against the
 * order every time it is opened, and an order that was paid, cancelled or
 * expired meanwhile is refused (`payableState`). That is the revocation that
 * matters. The `purpose` claim is what keeps it from being anything else: a
 * session cookie carries no purpose and is refused here, and this token
 * carries no session `kind` and is refused by `verifyToken`.
 *
 * **What the link may show is decided by who can end up holding it.** A link
 * is copied into Messenger and forwarded; the public page (`/pay/[token]`)
 * shows the race, the runner count, the amount and the method, and never an
 * email, phone or birthdate.
 */

const PURPOSE = 'resume-payment';

/** A link for this order, valid until `expiresAt` (the order's `expiresBy`). */
export async function createResumePaymentToken(registrationId: string, expiresAt: Date): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(registrationId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(SECRET_KEY);
}

/** The order a link names, or null for a forged, expired or foreign token. */
export async function readResumePaymentToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
    if (payload.purpose !== PURPOSE || typeof payload.sub !== 'string' || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** Where a link lands: the public page, on whichever host made it. */
export function resumePaymentUrl(origin: string, token: string): string {
  return `${origin}/pay/${token}`;
}

/** Whether an order can still be paid through its link, and if not, why. */
export type PayableState = 'payable' | 'paid' | 'cancelled' | 'expired' | 'unavailable';

/**
 * The one rule both the staff side (copying a link) and the public side
 * (opening and paying it) apply, so the two cannot disagree about an order.
 *
 * - **PAID** — nothing left to pay.
 * - **CANCELLED / REFUNDED**, or a deleted order — closed on purpose.
 * - **EXPIRED**, or PENDING past `expiresBy` — the slot and promo are going
 *   or gone. Decision D5: an expired order is not reopened here; the runner
 *   registers again. `expiresBy`, not the bare hold, because that is the
 *   moment the order really lets go (the sweep runs once a day) and the time
 *   staff read on the tab: an order at hour 25 still holds its slot, and a
 *   link copied then moves its hold, which is the case decision D4 is for.
 * - **unavailable** — PENDING but not an online order this app can still take
 *   through PayMongo: a bank transfer, a method no longer offered (production
 *   takes QRPh only), or an order with no runner left on it. Also an order
 *   that had a runner removed: removing one never lowers the stored total, so
 *   a link would charge for a place nobody holds.
 */
export function payableState(
  order: {
    status: string;
    paymentMethod: string;
    createdAt: Date;
    holdUntil: Date | null;
    deletedAt: Date | null;
    liveRunners: number;
    removedRunners: number;
  },
  now: Date = new Date(),
): PayableState {
  if (order.status === 'PAID') return 'paid';
  if (order.deletedAt || order.status === 'CANCELLED' || order.status === 'REFUNDED') return 'cancelled';
  if (order.status === 'EXPIRED') return 'expired';
  if (order.status !== 'PENDING') return 'unavailable';
  if (expiresBy(order.createdAt, order.holdUntil) <= now) return 'expired';
  if (!isPayMongoMethod(order.paymentMethod) || order.liveRunners === 0 || order.removedRunners > 0) {
    return 'unavailable';
  }
  return 'payable';
}

// ── The second kind: a category change's payment link ────────────────────────

/**
 * The link for an upgrade's payment (CATEGORY_CHANGE_PLAN.md Session 3): the
 * same stateless token as an order's, of a second kind. `purpose` is what
 * keeps the two apart — an order's token opens no change and a change's token
 * opens no order, because each reader refuses the other's purpose — and the
 * subject is the change's id. It expires with the change's hold, and is
 * checked against the change every time it is opened (`changePayableState`),
 * so a change applied, cancelled or expired meanwhile is refused.
 *
 * The page it opens (`/pay/change/[token]`) shows the race, the two categories
 * and the money, and never the runner's name, email or phone: like an order's
 * link, it is pasted into Messenger and forwarded.
 */
const CHANGE_PURPOSE = 'category-change-payment';

/** A link for this change, valid until `expiresAt` (the change's hold). */
export async function createChangePaymentToken(changeId: string, expiresAt: Date): Promise<string> {
  return new SignJWT({ purpose: CHANGE_PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(changeId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(SECRET_KEY);
}

/** The change a link names, or null for a forged, expired or foreign token. */
export async function readChangePaymentToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
    if (payload.purpose !== CHANGE_PURPOSE || typeof payload.sub !== 'string' || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** Where a change's link lands, on whichever host made it. */
export function changePaymentUrl(origin: string, token: string): string {
  return `${origin}/pay/change/${token}`;
}
