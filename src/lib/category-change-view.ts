import 'server-only';
import type { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { kitDifference } from '@/lib/category-change';
import { categoryChangeAppliedEmail, sendCategoryChangeEmail } from '@/lib/email-category-change';

/**
 * **A category change as the registrants screen reads it, and its applied
 * email's delivery** (CATEGORY_CHANGE_PLAN.md D7). `categoryChangeView` is the
 * one shape the row, the history and every route's answer carry — category
 * names resolved, the kit difference worked out, dates as strings — so a
 * write's answer can replace the screen's copy without a reload.
 *
 * The applied email is sent here, after a write has committed and never inside
 * it: a Resend outage must not roll back a move staff already confirmed. Its
 * outcome is stamped on the change (`appliedEmailSentAt`, `lastEmailError`),
 * meaning what the same columns mean on Registration.
 *
 * Split out of `category-change-store.ts`, which owns the writes. Server-only.
 */

const VIEW_INCLUDE = {
  fromCategory: { select: { name: true } },
  toCategory: { select: { name: true } },
} as const;

type ChangeWithNames = Prisma.CategoryChangeGetPayload<{ include: typeof VIEW_INCLUDE }>;

/** One change as the registrants screen reads it: names resolved, dates as strings. */
export function categoryChangeView(change: ChangeWithNames) {
  const kit = kitDifference(change.fromInclusions, change.toInclusions);
  return {
    id: change.id,
    changeRef: change.changeRef,
    status: change.status,
    fromCategory: change.fromCategory.name,
    toCategory: change.toCategory.name,
    basis: change.basis,
    basisEstimated: change.basisEstimated,
    basisAdjustReason: change.basisAdjustReason,
    toPrice: change.toPrice,
    changeFee: change.changeFee,
    difference: change.difference,
    amount: change.amount,
    totalCharged: change.totalCharged,
    refundAmount: change.refundAmount,
    refundReference: change.refundReference,
    refundedAt: change.refundedAt?.toISOString() ?? null,
    refundedBy: change.refundedBy,
    fromInclusions: change.fromInclusions,
    toInclusions: change.toInclusions,
    kitAdded: kit.added,
    kitRemoved: kit.removed,
    reason: change.reason,
    createdBy: change.createdBy,
    createdAt: change.createdAt.toISOString(),
    appliedAt: change.appliedAt?.toISOString() ?? null,
    // An upgrade's payment (Session 3). The proof's pathname stays on the
    // server: the screen opens it through the signed-URL route.
    paymentMethod: change.paymentMethod,
    transactionFee: change.transactionFee,
    transactionNumber: change.transactionNumber,
    hasProof: change.proofOfPayment !== null,
    holdUntil: change.holdUntil?.toISOString() ?? null,
    cancelledAt: change.cancelledAt?.toISOString() ?? null,
    cancelledBy: change.cancelledBy,
    expiredAt: change.expiredAt?.toISOString() ?? null,
    createdEmailSentAt: change.createdEmailSentAt?.toISOString() ?? null,
    appliedEmailSentAt: change.appliedEmailSentAt?.toISOString() ?? null,
    lastEmailError: change.lastEmailError,
  };
}

export type CategoryChangeView = ReturnType<typeof categoryChangeView>;

/** A change by id, as the screen reads it, after a write. */
export async function readCategoryChangeView(changeId: string): Promise<CategoryChangeView> {
  return categoryChangeView(
    await db.categoryChange.findUniqueOrThrow({ where: { id: changeId }, include: VIEW_INCLUDE }),
  );
}

/** Every change on an event, oldest first, grouped by runner — one query for the screen. */
export async function categoryChangesByRunner(eventId: string): Promise<Map<string, CategoryChangeView[]>> {
  const rows = await db.categoryChange.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
    include: VIEW_INCLUDE,
  });
  const byRunner = new Map<string, CategoryChangeView[]>();
  for (const row of rows) {
    const list = byRunner.get(row.runnerId) ?? [];
    list.push(categoryChangeView(row));
    byRunner.set(row.runnerId, list);
  }
  return byRunner;
}

// ── The applied email ────────────────────────────────────────────────────────

/**
 * The applied email's delivery, stamped on the change (same meaning as the
 * columns on Registration): sent, or Resend's reason so the history can offer
 * the by-hand send.
 */
export async function stampAppliedEmail(changeId: string, outcome: { sent: true } | { sent: false; error: string }) {
  return db.categoryChange.update({
    where: { id: changeId },
    data: outcome.sent
      ? { appliedEmailSentAt: new Date(), lastEmailError: null }
      : { lastEmailError: outcome.error },
  });
}


/** The applied email for a change, rendered, without sending it. */
export async function renderAppliedEmail(changeId: string) {
  const change = await db.categoryChange.findUniqueOrThrow({
    where: { id: changeId },
    include: {
      fromCategory: { select: { name: true, distance: true } },
      toCategory: { select: { name: true, distance: true } },
      runner: { select: { firstName: true, lastName: true, email: true } },
      registration: { select: { orderRef: true } },
      event: { select: { title: true } },
    },
  });
  return categoryChangeAppliedEmail(change);
}

/**
 * Sends the applied email and stamps the outcome on the change. Called after
 * the write has committed, never inside it: a Resend outage must not roll back
 * a move staff already confirmed. A refusal comes back with the rendered
 * message, so the modal can go straight to the by-hand send.
 */
export async function deliverAppliedEmail(changeId: string) {
  const message = await renderAppliedEmail(changeId);
  const outcome = await sendCategoryChangeEmail(message);
  await stampAppliedEmail(changeId, outcome);
  const rendered = { to: message.to, subject: message.subject, html: message.html, text: message.text };
  return outcome.sent
    ? { sent: true as const, to: message.to }
    : { sent: false as const, error: outcome.error, message: rendered };
}
