/**
 * One GCash or bank reference, one payment (PAYMENT_REFERENCE_UNIQUE_PLAN.md,
 * written up in docs/current-state.md). On 2026-11-05 one ₱934 transfer was
 * submitted for two NEURUN 2027 orders and nothing noticed.
 *
 * **The rule this module owns:**
 * - **R1 — app-wide.** A reference is held by at most one live record across
 *   every event and all three kinds: an order (`Registration`), an upgrade
 *   (`CategoryChange`) and a switch (`LogisticsChange`).
 * - **R2 — compared normalized.** `normalizeReference`: uppercase, letters and
 *   digits only, so `8046 902-259946` is `8046902259946`. Stored in
 *   `transactionRef` beside the runner's own spelling in `transactionNumber`.
 * - **R3 — who holds one.** An order that is PENDING, PAID or REFUNDED; an
 *   upgrade or switch that is AWAITING_PAYMENT, APPLIED, REFUND_DUE or
 *   REFUNDED. EXPIRED and CANCELLED let go of it. A refunded one stays taken.
 * - **R4 — no override.** One transfer for several runners is a group order.
 * - **R5 — privacy.** The runner is never told whose record holds it
 *   (`REFERENCE_IN_USE_RUNNER`); staff get the holder's reference as a link.
 * - **R6 — old rows are not rewritten.** Checked on new writes only.
 *
 * **Every writer calls `claimReference` inside its own transaction**, before
 * it writes. It takes a transaction-scoped advisory lock on the reference, so
 * two submits of one reference wait on the same key and the second sees the
 * first's row, across all three tables. The partial unique indexes on
 * `Registration` and `CategoryChange` are the last guard behind it.
 */

import { Prisma } from '@prisma/client';

/** Order statuses that hold a reference (R3). Matches the partial unique index. */
export const ORDER_REFERENCE_STATUSES = ['PENDING', 'PAID', 'REFUNDED'] as const;

/** Upgrade and switch statuses that hold a reference (R3). */
export const CHANGE_REFERENCE_STATUSES = ['AWAITING_PAYMENT', 'APPLIED', 'REFUND_DUE', 'REFUNDED'] as const;

/** The runner's sentence (R5): no name, no order. */
export const REFERENCE_IN_USE_RUNNER =
  'This reference number was already used for another payment. If one transfer paid for several runners, register them together as a group.';

/** Staff's sentence when only the unique index caught it (no holder to name). */
export const REFERENCE_INDEX_REFUSED =
  'This reference number is already on another live payment, so nothing was changed. Search the registrants for it.';

export type ReferenceKind = 'order' | 'upgrade' | 'switch';

/** The record that already holds a reference, as staff may see it. */
export type ReferenceHolder = {
  kind: ReferenceKind;
  /** `RM-…` for an order, the change's own reference otherwise. */
  ref: string;
  /** The registrants page filtered to the order it sits on. */
  href: string;
};

/** R2. Null for blank, or for a value with no letter or digit in it. */
export function normalizeReference(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return value || null;
}

/** Whether an order in this status holds its reference (R3). */
export function orderHoldsReference(status: string): boolean {
  return (ORDER_REFERENCE_STATUSES as readonly string[]).includes(status);
}

/** A reference another live record already holds. Answered as a 409. */
export class ReferenceInUseError extends Error {
  readonly status = 409;
  constructor(
    readonly reference: string,
    readonly holder: ReferenceHolder,
  ) {
    super(`Reference ${reference} is already on ${holder.ref}.`);
  }

  /** What a staff screen shows: the sentence and the holder's link (R5). */
  staffBody() {
    return { error: this.message, referenceHolder: this.holder };
  }

  /** What a runner screen shows: nothing about the other record (R5). */
  runnerBody() {
    return { error: REFERENCE_IN_USE_RUNNER, field: 'transactionNumber' as const };
  }
}

type Except = { kind: ReferenceKind; id: string };

/**
 * Claim `raw` for the record about to be written. Inside the caller's
 * transaction: locks the reference, then looks for a live holder other than
 * `except` (the record being written, so replacing one's own proof with the
 * same reference passes). Returns the normalized value to store in
 * `transactionRef`, or null when there is nothing to claim.
 */
export async function claimReference(
  tx: Prisma.TransactionClient,
  raw: string | null | undefined,
  { except }: { except?: Except } = {},
): Promise<string | null> {
  const ref = normalizeReference(raw);
  if (!ref) return null;

  // Held until the transaction ends; two claims of one reference queue here.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payref:${ref}`}))`;

  const exceptKind = except?.kind ?? '';
  const exceptId = except?.id ?? '';
  const rows = await tx.$queryRaw<{ kind: ReferenceKind; ref: string; orderRef: string | null; eventId: string }[]>`
    SELECT 'order' AS "kind", r."orderRef" AS "ref", r."orderRef" AS "orderRef", r."eventId" AS "eventId"
      FROM "Registration" r
      WHERE r."transactionRef" = ${ref}
        AND r."status" IN (${Prisma.join([...ORDER_REFERENCE_STATUSES])})
        AND NOT (${exceptKind} = 'order' AND r."id" = ${exceptId})
    UNION ALL
    SELECT 'upgrade', c."changeRef", r."orderRef", c."eventId"
      FROM "CategoryChange" c JOIN "Registration" r ON r."id" = c."registrationId"
      WHERE c."transactionRef" = ${ref}
        AND c."status" IN (${Prisma.join([...CHANGE_REFERENCE_STATUSES])})
        AND NOT (${exceptKind} = 'upgrade' AND c."id" = ${exceptId})
    UNION ALL
    SELECT 'switch', l."changeRef",
        (SELECT r."orderRef" FROM "LogisticsChangeOrder" o JOIN "Registration" r ON r."id" = o."registrationId"
          WHERE o."changeId" = l."id" ORDER BY r."orderRef" LIMIT 1),
        l."eventId"
      FROM "LogisticsChange" l
      WHERE l."transactionRef" = ${ref}
        AND l."status" IN (${Prisma.join([...CHANGE_REFERENCE_STATUSES])})
        AND NOT (${exceptKind} = 'switch' AND l."id" = ${exceptId})
    LIMIT 1`;

  const found = rows[0];
  if (found) {
    const search = found.orderRef ?? found.ref;
    throw new ReferenceInUseError(ref, {
      kind: found.kind,
      ref: found.ref,
      href: `/admin/events/${found.eventId}/registrants?search=${encodeURIComponent(search)}`,
    });
  }
  return ref;
}

/**
 * The unique index refused a write (a path that skipped `claimReference`, or
 * a race it lost). Lets a route answer with a sentence instead of a 500.
 */
export function isReferenceIndexViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  return JSON.stringify(error.meta ?? {}).includes('transactionRef');
}
