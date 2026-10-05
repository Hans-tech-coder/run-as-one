/**
 * How an online order becomes PAID: one path, whether PayMongo tells us
 * (the webhook) or a staff member asks PayMongo (the Unpaid checkouts tab's
 * "Check with PayMongo", UNPAID_ORDERS_PLAN.md Batch 4). Both call
 * `settleOnlinePayment`, so they cannot disagree about which orders may flip,
 * and a payment found by hand gets the same receipt a webhook would have sent.
 *
 * **Only a PENDING order is waiting for a payment.** An EXPIRED one has
 * already handed its slot and promo back (lib/pending-expiry.ts), and a
 * CANCELLED / REFUNDED one was closed by a person — flipping either to PAID
 * would oversell the category or reopen a closed order. Those are left for a
 * person to reinstate or refund.
 *
 * **The flip is conditional on PENDING**, so two webhook deliveries racing
 * each other, a webhook racing the button, or the sweep expiring the order in
 * between cannot both flip it and send two receipts.
 */

import prisma from './db';
import { recordAudit, type AuditActor, type AuditEntry } from './audit';
import { deliverConfirmationEmail } from './email-delivery';

export type SettleOutcome =
  | { outcome: 'marked_paid' }
  | { outcome: 'already_paid' }
  /** The order is EXPIRED, CANCELLED or REFUNDED; nothing was changed. */
  | { outcome: 'not_pending'; status: string };

/**
 * Marks a PENDING online order PAID and sends its receipt. With `audit`, the
 * trail row is written in the same transaction as the flip; the webhook has
 * no person to name and passes none, as it always has.
 */
export async function settleOnlinePayment(
  registrationId: string,
  audit?: { actor: AuditActor; entry: AuditEntry },
): Promise<SettleOutcome> {
  const flipped = await prisma.$transaction(async tx => {
    const result = await tx.registration.updateMany({
      where: { id: registrationId, status: 'PENDING' },
      data: { status: 'PAID' },
    });
    if (result.count > 0 && audit) await recordAudit(tx, audit.actor, audit.entry);
    return result.count > 0;
  });

  if (!flipped) {
    const current = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: { status: true },
    });
    return current?.status === 'PAID'
      ? { outcome: 'already_paid' }
      : { outcome: 'not_pending', status: current?.status ?? 'MISSING' };
  }

  const full = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      event: true,
      // A runner removed from the order is not on the receipt.
      runners: { where: { deletedAt: null }, include: { category: true } },
    },
  });
  if (full) await deliverConfirmationEmail(full);
  return { outcome: 'marked_paid' };
}

/** What PayMongo says about the payment page an order was sent to. */
export type PaymongoLookup =
  | { paid: true }
  | { paid: false }
  /** PayMongo could not be asked, or did not answer usably. */
  | { error: string };

/**
 * Asks PayMongo whether the checkout behind `checkoutSessionId` was paid.
 *
 * The id is whatever /api/checkout stored: a Checkout Session (`cs_…`) for
 * card and QRPh, a Payment Intent (`pi_…`) for GCash and Maya. Fields read, per
 * PayMongo's API reference (checked 2026-10-05):
 *
 * - Checkout Session: `attributes.payments[]`, each with `attributes.status`
 *   `pending` | `paid` | `failed`; and `attributes.payment_intent.attributes.status`.
 * - Payment Intent: `attributes.status`, one of `awaiting_payment_method`,
 *   `awaiting_next_action`, `processing`, `succeeded`. `payments` is returned
 *   only to the secret key, which is what this uses.
 *
 * Either a `paid` payment or a `succeeded` intent counts. `processing` does
 * not: the money has not landed, and PayMongo will still send the webhook.
 */
export async function lookUpPaymongoPayment(checkoutSessionId: string): Promise<PaymongoLookup> {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) return { error: 'PayMongo is not set up on this server.' };

  const resource = checkoutSessionId.startsWith('cs_')
    ? 'checkout_sessions'
    : checkoutSessionId.startsWith('pi_')
      ? 'payment_intents'
      : null;
  if (!resource) return { error: 'This order has no PayMongo payment page to look up.' };

  let res: Response;
  try {
    res = await fetch(`https://api.paymongo.com/v1/${resource}/${encodeURIComponent(checkoutSessionId)}`, {
      headers: {
        accept: 'application/json',
        authorization: `Basic ${Buffer.from(secretKey).toString('base64')}`,
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('PayMongo lookup failed:', error);
    return { error: 'PayMongo could not be reached. Try again in a minute.' };
  }

  const body = await res.json().catch(() => null);
  // A live-mode id asked with a test key (a database copied down from
  // production) lands here too.
  if (res.status === 404) {
    return { error: 'PayMongo has no record of this order’s payment page under the current PayMongo account.' };
  }
  if (!res.ok || !body?.data?.attributes) {
    console.error(`PayMongo lookup for ${checkoutSessionId} answered ${res.status}:`, body);
    return { error: 'PayMongo did not answer the lookup. Try again in a minute.' };
  }

  const attributes = body.data.attributes;
  const intent = resource === 'payment_intents' ? attributes : attributes.payment_intent?.attributes;
  const payments: { attributes?: { status?: string } }[] = Array.isArray(attributes.payments)
    ? attributes.payments
    : Array.isArray(intent?.payments)
      ? intent.payments
      : [];

  const paid = intent?.status === 'succeeded' || payments.some(p => p.attributes?.status === 'paid');
  return { paid };
}
