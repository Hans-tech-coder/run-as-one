/**
 * Who counts as the same runner within one event, and which of their other
 * orders count (DUPLICATE_ORDERS_PLAN.md).
 *
 * On 2026-11-20 a group paid six runners by QRPh, then registered the same six
 * again by bank transfer and attached the QRPh receipt as proof. Nothing asked
 * whether those runners were already in. The same blind spot filled half the
 * Unpaid checkouts tab with orders whose runners had since paid elsewhere.
 *
 * **The rule this module owns:**
 * - **M1 — same runner.** Same event + first name + last name (trimmed, spaces
 *   collapsed, case-insensitive) + the same `birthdate` string (`YYYY-MM-DD`).
 *   Email is deliberately not part of it: a group order often carries the
 *   leader's email for everyone, so it would both miss and falsely match.
 * - **M2 — live order.** Not removed, the runner not removed (a refund
 *   removes the runner too, lib/refund-store.ts), and PAID or a
 *   PENDING bank transfer (`awaitingVerificationWhere`). An abandoned online
 *   PENDING, EXPIRED, CANCELLED or REFUNDED order never counts, so a runner who
 *   walks away from a QRPh checkout can still register by bank transfer.
 * - **M3 — per runner, not per order.** An individual later joining a group
 *   (or the reverse) is matched runner by runner.
 * - **M4 — privacy.** The runner is told only their own name
 *   (`RunnerAlreadyRegisteredError.runnerBody`); staff get the order refs.
 * - **M5 — nothing is rewritten.** A covered unpaid order keeps its status, so
 *   it reappears by itself if the covering bank transfer is rejected.
 */

import type { Prisma } from '@prisma/client';
import type db from '@/lib/db';
import { awaitingVerificationWhere } from '@/lib/pending-expiry';

type Client = Prisma.TransactionClient | typeof db;

export type RunnerIdentity = { firstName: string; lastName: string; birthdate: string };

/** Another live order the runner is already on. */
export type LiveMatch = {
  registrationId: string;
  orderRef: string;
  status: string;
  paymentMethod: string;
};

function normName(value: string): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** M1's key. Two runners with equal keys in one event are the same runner. */
export function runnerKey(r: RunnerIdentity): string {
  return `${normName(r.firstName)}|${normName(r.lastName)}|${r.birthdate.trim()}`;
}

/** M2 as a `Registration` where. */
export function liveOrderWhere(): Prisma.RegistrationWhereInput {
  return { deletedAt: null, OR: [{ status: 'PAID' }, awaitingVerificationWhere()] };
}

/**
 * For each input runner already on another live order in `eventId`, the
 * orders they are on, keyed by `runnerKey`. One query: live runners whose
 * birthdate is in the input set (stored as an exact `YYYY-MM-DD`, so it is the
 * selective column that needs no normalizing); the names are compared here,
 * through `runnerKey`, so stray spacing or case in a stored name still matches.
 */
export async function findLiveMatches(
  client: Client,
  eventId: string,
  runners: RunnerIdentity[],
  { excludeRegistrationId }: { excludeRegistrationId?: string } = {},
): Promise<Map<string, LiveMatch[]>> {
  const result = new Map<string, LiveMatch[]>();
  const wanted = new Set(runners.map(runnerKey));
  const birthdates = [...new Set(runners.map((r) => r.birthdate.trim()).filter(Boolean))];
  if (birthdates.length === 0) return result;

  const rows = await client.runner.findMany({
    where: {
      deletedAt: null,
      birthdate: { in: birthdates },
      registration: {
        ...liveOrderWhere(),
        eventId,
        ...(excludeRegistrationId ? { id: { not: excludeRegistrationId } } : {}),
      },
    },
    select: {
      firstName: true,
      lastName: true,
      birthdate: true,
      registration: { select: { id: true, orderRef: true, status: true, paymentMethod: true } },
    },
  });

  for (const row of rows) {
    const key = runnerKey(row);
    if (!wanted.has(key)) continue;
    const list = result.get(key) ?? [];
    if (!list.some((m) => m.registrationId === row.registration.id)) {
      list.push({
        registrationId: row.registration.id,
        orderRef: row.registration.orderRef,
        status: row.registration.status,
        paymentMethod: row.registration.paymentMethod,
      });
    }
    result.set(key, list);
  }
  return result;
}

export type Coverage = { covered: number; total: number; byOrderRefs: string[] };

/**
 * Per order, how many of its runners are already on some *other* live order
 * (M3). Orders with no covered runner are left out.
 */
export function coverage(
  orders: { id: string; runners: RunnerIdentity[] }[],
  matches: Map<string, LiveMatch[]>,
): Map<string, Coverage> {
  const out = new Map<string, Coverage>();
  for (const order of orders) {
    let covered = 0;
    const refs = new Set<string>();
    for (const runner of order.runners) {
      const others = (matches.get(runnerKey(runner)) ?? []).filter((m) => m.registrationId !== order.id);
      if (others.length === 0) continue;
      covered += 1;
      for (const m of others) refs.add(m.orderRef);
    }
    if (covered > 0) out.set(order.id, { covered, total: order.runners.length, byOrderRefs: [...refs].sort() });
  }
  return out;
}

/** A runner on the order being placed is already on a live order (M2). Answered as a 409. */
export class RunnerAlreadyRegisteredError extends Error {
  readonly status = 409;
  constructor(
    readonly runnerName: string,
    readonly orderRefs: string[],
    /** The same runner twice in the order being placed, not on another one. */
    readonly inThisOrder = false,
  ) {
    super(
      inThisOrder
        ? `${runnerName} is entered twice in this order.`
        : `${runnerName} is already registered in ${orderRefs.join(', ')}.`,
    );
  }

  /** What the runner sees (M4): their own name, no order, no email. */
  runnerBody() {
    return {
      error: this.inThisOrder
        ? `${this.runnerName} is entered more than once in this order. Remove the extra runner and try again.`
        : `${this.runnerName} is already registered for this race. Check your confirmation email, or contact us.`,
      code: 'runnerAlreadyRegistered' as const,
    };
  }
}

/**
 * Inside a checkout transaction, before any write: refuse the order if any of
 * its runners is already on a live order in the event.
 */
export async function assertRunnersNotRegistered(
  client: Client,
  eventId: string,
  runners: RunnerIdentity[],
): Promise<void> {
  const runnerName = (r: RunnerIdentity) =>
    `${String(r.firstName ?? '').trim()} ${String(r.lastName ?? '').trim()}`.replace(/\s+/g, ' ').toUpperCase();
  // The same person twice in one group is the same double entry (M3).
  const seen = new Set<string>();
  for (const runner of runners) {
    const key = runnerKey(runner);
    if (seen.has(key)) throw new RunnerAlreadyRegisteredError(runnerName(runner), [], true);
    seen.add(key);
  }
  const matches = await findLiveMatches(client, eventId, runners);
  for (const runner of runners) {
    const found = matches.get(runnerKey(runner));
    if (found?.length) {
      throw new RunnerAlreadyRegisteredError(runnerName(runner), found.map((m) => m.orderRef));
    }
  }
}
