/**
 * Correcting a manual order's payment details after checkout
 * (PAYMENT_CORRECTION_PLAN.md C1–C8). A runner types the wrong Transaction
 * No. or attaches the wrong slip; before this, `transactionNumber` and
 * `proofOfPayment` were written once by `api/checkout/manual` and never again.
 *
 * **The rule this module owns:**
 * - **C1 — what.** `transactionNumber` (read through `readTransactionNumber`),
 *   `proofOfPayment` (a new private pathname, uploaded by the caller) and
 *   `paymentMethod` — between the manual methods only, which today is just
 *   `BANK_TRANSFER`: the manual checkout writes nothing else, and a stored
 *   `GCASH` means a PayMongo order, which the registrants list hides and the
 *   24h sweep expires. Amounts are never edited here.
 * - **C2 — which orders.** Manual (bank transfer) orders that are `PENDING`
 *   or `PAID`. Online orders are refused (PayMongo's record is the truth), as
 *   is a complimentary order (nothing was paid). `EXPIRED` / `CANCELLED` are
 *   reopened through the status route first. `expectedStatus`, when sent, is
 *   the status the screen showed; an order that has moved is refused, as the
 *   cancel flow does.
 * - **C2a — PAID needs a step-up.** Enforced by the route, which spends the
 *   token inside the same transaction (`lib/step-up.ts` `consumeStepUp`).
 * - **C4 — a reason is always written**, into the trail summary and changes.
 * - **C5 — the old proof is kept.** Its pathname stays in the trail as
 *   `changes.proofOfPayment = [old, new]`; nothing here deletes a blob.
 * - **C7** — item 16's `claimReference` (with `except: this order`) is added
 *   here when that item is built.
 * - **C8 — not a status change.** `status` is never written; marking PAID is
 *   still the validator's separate press.
 *
 * Only the fields that actually change are written, and a correction that
 * changes nothing is refused rather than writing an empty trail line. The
 * order row is locked `FOR UPDATE` first, so two corrections, or a correction
 * and a status change, cannot interleave between the check and the write.
 */

import { Prisma } from '@prisma/client';
import type { Actor } from './actor';
import { recordAudit, type AuditChanges } from './audit';
import { readTransactionNumber } from './category-change-hold';
import { PAYMENT_METHODS, asPaymentMethod } from './registration-codes';

/** The methods a manual order may hold. The manual checkout writes only this one. */
export const MANUAL_PAYMENT_METHODS = [PAYMENT_METHODS.BANK_TRANSFER] as const;

/** The statuses a correction may land on (C2). */
export const CORRECTABLE_STATUSES = ['PENDING', 'PAID'] as const;

/** One trail line's worth of "why". */
export const CORRECTION_REASON_MAX = 200;

export function isManualPaymentMethod(value: unknown): boolean {
  return (MANUAL_PAYMENT_METHODS as readonly string[]).includes(asPaymentMethod(value));
}

/** Refused with a sentence the screen shows as it is. */
export class CorrectionRefused extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type CorrectionInput = {
  registrationId: string;
  /** Raw from the form; undefined or blank means "leave it". */
  transactionNumber?: unknown;
  /** The new proof's private pathname, already uploaded. */
  proofPathname?: string | null;
  /** Raw from the form; undefined or blank means "leave it". */
  paymentMethod?: unknown;
  reason: unknown;
  /** The status the screen showed, when it sent one. */
  expectedStatus?: unknown;
  actor: Actor;
};

/** The parts of the order the route needs after the lock (status for the step-up). */
export type LockedOrder = {
  id: string;
  orderRef: string;
  status: string;
  paymentMethod: string;
  transactionNumber: string | null;
  proofOfPayment: string | null;
  eventId: string;
};

/** Read and check the reason (C4). */
export function readCorrectionReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (!reason) throw new CorrectionRefused('Write why the payment details are being corrected.', 400);
  if (reason.length > CORRECTION_REASON_MAX) {
    throw new CorrectionRefused(
      `Keep the reason to ${CORRECTION_REASON_MAX} characters. It is ${reason.length} now.`,
      400,
    );
  }
  return reason;
}

/**
 * Whether this order can be corrected at all, from what a plain read shows.
 * The route calls it before uploading, so a refusal costs no blob; the
 * correction calls it again under the lock.
 */
export function refusalFor(
  order: Pick<LockedOrder, 'orderRef' | 'status' | 'paymentMethod'>,
  expectedStatus?: unknown,
): CorrectionRefused | null {
  if (!isManualPaymentMethod(order.paymentMethod)) {
    return new CorrectionRefused(
      asPaymentMethod(order.paymentMethod) === PAYMENT_METHODS.COMPLIMENTARY
        ? `${order.orderRef} was a free entry, so there is no payment to correct.`
        : `${order.orderRef} was paid online, so its payment details come from PayMongo and cannot be corrected here.`,
      409,
    );
  }
  if (expectedStatus !== undefined && expectedStatus !== null && expectedStatus !== '' && order.status !== expectedStatus) {
    return new CorrectionRefused(
      `${order.orderRef} is ${order.status.toLowerCase()} now, not ${String(expectedStatus).toLowerCase()}, so nothing was changed. Reload the page to see where it stands.`,
      409,
    );
  }
  if (!(CORRECTABLE_STATUSES as readonly string[]).includes(order.status)) {
    return new CorrectionRefused(
      `${order.orderRef} is ${order.status.toLowerCase()}. Only pending or paid orders can have their payment corrected; reopen it first.`,
      409,
    );
  }
  return null;
}

/** Lock the order row and read what a correction needs. */
export async function lockOrder(tx: Prisma.TransactionClient, registrationId: string): Promise<LockedOrder | null> {
  const rows = await tx.$queryRaw<LockedOrder[]>(
    Prisma.sql`SELECT "id", "orderRef", "status", "paymentMethod", "transactionNumber", "proofOfPayment", "eventId"
      FROM "Registration" WHERE "id" = ${registrationId} FOR UPDATE`,
  );
  return rows[0] ?? null;
}

/**
 * Apply a correction inside the caller's transaction. Throws
 * `CorrectionRefused` for anything it will not do; the caller rolls back and
 * discards the uploaded proof. Pass the order already locked by `lockOrder`
 * (the route needs its status to decide on the step-up first).
 */
export async function correctPayment(
  tx: Prisma.TransactionClient,
  input: CorrectionInput & { order: LockedOrder; organizerId: string },
): Promise<{ changes: AuditChanges; fields: string[] }> {
  const { order, actor } = input;
  const reason = readCorrectionReason(input.reason);

  const refused = refusalFor(order, input.expectedStatus);
  if (refused) throw refused;

  const data: { transactionNumber?: string; proofOfPayment?: string; paymentMethod?: string } = {};
  const changes: AuditChanges = {};

  const rawRef = input.transactionNumber;
  if (typeof rawRef === 'string' && rawRef.trim()) {
    const { value, error } = readTransactionNumber(rawRef);
    if (error || !value) throw new CorrectionRefused(error ?? 'Enter the reference number.', 400);
    if (value !== order.transactionNumber) {
      data.transactionNumber = value;
      changes.transactionNumber = [order.transactionNumber, value];
    }
  } else if (rawRef !== undefined && rawRef !== null && typeof rawRef !== 'string') {
    throw new CorrectionRefused('The reference number must be text.', 400);
  }

  if (input.proofPathname) {
    data.proofOfPayment = input.proofPathname;
    // C5: the old pathname is kept here so the history can still open it.
    changes.proofOfPayment = [order.proofOfPayment, input.proofPathname];
  }

  const rawMethod = input.paymentMethod;
  if (typeof rawMethod === 'string' && rawMethod.trim()) {
    const method = asPaymentMethod(rawMethod);
    if (!isManualPaymentMethod(method)) {
      throw new CorrectionRefused(
        'A manual order can only be marked as a bank transfer. An online payment method would hide this order and let the sweep expire it.',
        400,
      );
    }
    if (method !== order.paymentMethod) {
      data.paymentMethod = method;
      changes.paymentMethod = [order.paymentMethod, method];
    }
  }

  const fields = Object.keys(changes);
  if (fields.length === 0) {
    throw new CorrectionRefused('Nothing would change. Enter a different reference number or attach a new proof.', 400);
  }

  await tx.registration.update({ where: { id: order.id }, data });

  const what = fields
    .map(field =>
      field === 'transactionNumber' ? 'Transaction No.' : field === 'proofOfPayment' ? 'proof of payment' : 'payment method',
    )
    .join(', ');
  await recordAudit(tx, actor, {
    action: 'registration.payment.corrected',
    entityType: 'Registration',
    entityId: order.id,
    eventId: order.eventId,
    organizerId: input.organizerId,
    summary: `Corrected the ${what} on ${order.orderRef} (${order.status.toLowerCase()}). Reason: ${reason.replace(/[.!?]+$/, '')}.`,
    changes: { ...changes, reason },
  });

  return { changes, fields };
}
