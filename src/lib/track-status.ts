/**
 * **Where a tracked order stands, and what is still owed on it**
 * (TRACK_PAGE_PLAN.md §3): the status card's facts for Track My Registration,
 * split out of lib/track.ts, which owns who may see what.
 *
 * - A bank transfer is *For validation* while PENDING and *Validated* once
 *   PAID, with the time staff marked it (the trail's status change, only its
 *   time read) or, failing that, the receipt's send.
 * - An online order PENDING inside its hold gets the resume-payment link (D5),
 *   by `payableState`, the rule staff and the pay page apply; outside it, it
 *   reads expired before the daily sweep marks it.
 * - An upgrade or a delivery switch awaiting money shows what is owed and its
 *   own pay link, made by the same `changeLinkFor` / `switchLinkFor` staff use;
 *   one whose proof is in reads as for validation, with no link.
 *
 * Amounts here are only the money still owed, never what was paid. Server-only.
 */

import 'server-only';
import prisma from './db';
import { formatEventInstant } from './event-schedule';
import { isBankTransfer, paymentMethodLabel } from './registration-codes';
import { bankTransferExpiresBy, expiresBy } from './pending-expiry';
import { createResumePaymentToken, payableState, resumePaymentUrl } from './resume-payment';
import { eventOrigin, type SiteClientRef } from './site-host';
import { runnerRef } from './order-ref';
import { CATEGORY_CHANGE_STATUSES } from './category-change';
import { changeProofSubmitted } from './category-change-hold';
import { changeLinkFor, payableStateOf, readChangeForPayment } from './category-change-payment';
import { LOGISTICS_CHANGE_STATUSES, LOGISTICS_DIRECTIONS } from './logistics-change';
import { switchProofSubmitted } from './logistics-change-proof';
import { readSwitchForPayment, switchLinkFor, switchPayableStateOf } from './logistics-change-payment';

/** Where the order stands, in the words the status card picks from. */
export type TrackStatusKind =
  | 'paid'
  | 'validated'
  | 'for-validation'
  | 'unpaid'
  | 'unpaid-closed'
  | 'expired'
  | 'cancelled'
  | 'refunded';

export type TrackStatus = {
  kind: TrackStatusKind;
  method: string;
  /** Submitted, paid, validated or expired on, in Manila time; blank when unknown. */
  at: string;
  /** Until when an unpaid order holds its slot. */
  holdUntil: string;
  payUrl: string | null;
};

/** The order fields the status is decided from. */
type StatusOrder = {
  id: string;
  status: string;
  paymentMethod: string;
  createdAt: Date;
  holdUntil: Date | null;
  expiredAt: Date | null;
  deletedAt: Date | null;
  confirmationEmailSentAt: Date | null;
  removedRunners: number;
  event: { id: string; client: SiteClientRef | null };
};

/** The order fields the owed changes are named from. */
type PendingOrder = { id: string; orderRef: string; runners: { id: string; runnerNo: number }[] };

export type TrackPending = {
  kind: 'category' | 'delivery';
  /** "Runner RM-…-2: 5K → 10K", "Pickup → delivery". */
  title: string;
  /** In centavos. */
  amount: number;
  proofSubmitted: boolean;
  payUrl: string | null;
  payBy: string | null;
};

/**
 * When a bank transfer was validated: the trail's last status change on it
 * (staff mark it PAID from the registrants screen), else the receipt's send.
 * Only the time is read — never who did it or why.
 */
async function validatedAt(order: StatusOrder): Promise<Date | null> {
  const entry = await prisma.auditLog.findFirst({
    where: {
      eventId: order.event.id,
      entityType: 'Registration',
      entityId: order.id,
      action: 'registration.status.changed',
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return entry?.createdAt ?? order.confirmationEmailSentAt;
}

export async function statusOf(order: StatusOrder, liveRunners: number, requestUrl: string, now: Date): Promise<TrackStatus> {
  const method = paymentMethodLabel(order.paymentMethod);
  const bank = isBankTransfer(order.paymentMethod);
  const base = { method, at: '', holdUntil: '', payUrl: null as string | null };
  const label = (date: Date | null) => (date ? formatEventInstant(date) : '');

  if (order.status === 'PAID') {
    return bank
      ? { ...base, kind: 'validated', at: label(await validatedAt(order)) }
      : { ...base, kind: 'paid', at: label(order.confirmationEmailSentAt) };
  }
  if (order.status === 'REFUNDED') return { ...base, kind: 'refunded' };
  if (order.status === 'CANCELLED') return { ...base, kind: 'cancelled' };

  if (bank) {
    if (order.status === 'EXPIRED') {
      return { ...base, kind: 'expired', at: label(order.expiredAt ?? bankTransferExpiresBy(order.createdAt)) };
    }
    return { ...base, kind: 'for-validation', at: label(order.createdAt) };
  }

  const state = payableState(
    { ...order, liveRunners },
    now,
  );
  const until = expiresBy(order.createdAt, order.holdUntil);
  if (state === 'expired') return { ...base, kind: 'expired', at: label(order.expiredAt ?? until) };
  if (state === 'payable') {
    // D5: the resume-payment link, made here as staff would make it, and
    // living exactly as long as the hold. It never moves the hold.
    const token = await createResumePaymentToken(order.id, until);
    return { ...base, kind: 'unpaid', holdUntil: label(until), payUrl: resumePaymentUrl(eventOrigin(order.event, requestUrl), token) };
  }
  return { ...base, kind: 'unpaid-closed', holdUntil: label(until) };
}

/** Upgrades and delivery switches still waiting on money, for the runners shown. */
export async function pendingFor(order: PendingOrder, runnerIds: string[], runnersOnOrder: number, requestUrl: string): Promise<TrackPending[]> {
  const [changes, switches] = await Promise.all([
    prisma.categoryChange.findMany({
      where: { registrationId: order.id, runnerId: { in: runnerIds }, status: CATEGORY_CHANGE_STATUSES.AWAITING_PAYMENT },
      select: { id: true },
    }),
    prisma.logisticsChangeOrder.findMany({
      where: { registrationId: order.id, change: { status: LOGISTICS_CHANGE_STATUSES.AWAITING_PAYMENT } },
      select: { changeId: true },
    }),
  ]);
  const pending: TrackPending[] = [];

  for (const { id } of changes) {
    const change = await readChangeForPayment(id);
    if (!change) continue;
    const proofSubmitted = changeProofSubmitted(change);
    const payable = payableStateOf(change) === 'payable';
    if (!proofSubmitted && !payable) continue;
    const link = payable && !proofSubmitted ? await changeLinkFor(change, requestUrl) : null;
    const runner = order.runners.find(r => r.id === change.runnerId);
    pending.push({
      kind: 'category',
      title: `${runner ? `${runnerRef(order.orderRef, runner.runnerNo, runnersOnOrder)}: ` : ''}${change.fromCategory.name} → ${change.toCategory.name}`,
      amount: change.amount,
      proofSubmitted,
      payUrl: link?.url ?? null,
      payBy: link?.untilLabel ?? null,
    });
  }

  for (const { changeId } of switches) {
    const change = await readSwitchForPayment(changeId);
    if (!change) continue;
    const proofSubmitted = switchProofSubmitted(change);
    const payable = switchPayableStateOf(change) === 'payable';
    if (!proofSubmitted && !payable) continue;
    const link = payable && !proofSubmitted ? await switchLinkFor(change, requestUrl) : null;
    pending.push({
      kind: 'delivery',
      title: change.direction === LOGISTICS_DIRECTIONS.TO_DELIVERY ? 'Pickup → delivery' : 'Delivery → pickup',
      amount: change.fee,
      proofSubmitted,
      payUrl: link?.url ?? null,
      payBy: link?.untilLabel ?? null,
    });
  }
  return pending;
}
