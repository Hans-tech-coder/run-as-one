/**
 * **Who may see which registration on Track My Registration, and what of it**
 * (TRACK_PAGE_PLAN.md §4, §5).
 *
 * **The group rule (§4): a person sees only what they submitted or what is
 * about them.** An order has one contact (`customerEmail`, who filled in the
 * form and paid) and each runner their own `email`:
 *
 * | Entered | Email matches | Shows |
 * | --- | --- | --- |
 * | order ref | the contact's | the whole order |
 * | order ref | a runner's | only the runner(s) with that email |
 * | runner ref `-N` | runner N's or the contact's | only runner N |
 * | anything else | | not found |
 *
 * Every failure — no such reference, a removed order, the wrong email, another
 * runner's email on a runner reference — is the one `TRACK_NOT_FOUND` (lib/track-input.ts), so the
 * answer never says which half was wrong. Emails are compared trimmed and
 * case-insensitive. A `-1` is accepted on an order that now has one runner,
 * because its email said `-1` before a runner was removed (lib/order-ref.ts).
 *
 * **The status is the order's**, so every runner on a group sees the same one;
 * a runner who is not the payer is told who registered them.
 *
 * **What leaves this module is already masked (§5).** The Prisma `select`s
 * below are the whitelist, like lib/client-runners.ts: no payment proof,
 * amount paid, staff remark, transaction number, street or barangay is ever
 * read, and the full email, phone, birthdate and medical note are read only to
 * be turned into the masked strings of lib/track-mask.ts here, on the server.
 * `TrackView` has no field that could carry the full value.
 *
 * Read on demand only — no polling, no refresh — because Neon's compute is
 * billed by wake-ups.
 */

import 'server-only';
import prisma from './db';
import { formatEventDay, formatEventRange, hasFinished } from './event-schedule';
import { VIRTUAL_RUN_WHERE, awaitingResults, isVirtual, takesResults } from './event-format';
import { runnerRef } from './order-ref';
import { PICKUP_FALLBACK, pickupDetails, pickupLabel } from './pickup';
import {
  LOGISTICS_METHODS,
  asLogisticsMethod,
  deliveryZoneLabelFor,
  isBankTransfer,
} from './registration-codes';
import { EVENT_SITE_CLIENT } from './site-client';
import { siteLabelOf } from './site-host';
import { runnerResultPath, resultsPath } from './event-slug';
import { chartSize } from './client-race-report';
import { EMAIL_KINDS, type EmailKind } from './email-delivery';
import { LOOKUP_TOKEN_MINUTES, createTrackToken, type TrackScope } from './track-link';
import { birthMonthYear, cityProvince, maskEmail, maskPhone, maskPhoneTail, medicalLine } from './track-mask';
import { parseDeliveryAddress } from '@/app/events/[slug]/register/delivery-address';
import type { TrackRef } from './track-input';
import { pendingFor, statusOf, type TrackPending, type TrackStatus } from './track-status';

export type { TrackPending, TrackStatus, TrackStatusKind } from './track-status';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The §4 rule: the scope this reference and email open, or null for "not found". */
export async function findTrackScope(ref: TrackRef, email: string): Promise<TrackScope | null> {
  const order = await prisma.registration.findUnique({
    where: { orderRef: ref.orderRef },
    select: {
      id: true,
      customerEmail: true,
      deletedAt: true,
      runners: { where: { deletedAt: null }, orderBy: { runnerNo: 'asc' }, select: { runnerNo: true, email: true } },
    },
  });
  if (!order || order.deletedAt || order.runners.length === 0) return null;
  const isContact = same(order.customerEmail, email);

  if (ref.runnerNo === null) {
    if (isContact) return { registrationId: order.id, runnerNos: null };
    const mine = order.runners.filter(runner => same(runner.email, email)).map(runner => runner.runnerNo);
    return mine.length > 0 ? { registrationId: order.id, runnerNos: mine } : null;
  }

  const runner =
    order.runners.find(r => r.runnerNo === ref.runnerNo) ??
    (ref.runnerNo === 1 && order.runners.length === 1 ? order.runners[0] : undefined);
  if (!runner) return null;
  return isContact || same(runner.email, email) ? { registrationId: order.id, runnerNos: [runner.runnerNo] } : null;
}

export type TrackRunner = {
  ref: string;
  name: string;
  gender: string;
  category: string;
  inclusions: string[];
  size: string;
  club: string;
  email: string;
  phone: string;
  birth: string;
  /** City and province only (D9); blank when none is on file. */
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  medical: 'Declared' | 'None declared';
  guardian: { name: string; relationship: string } | null;
  /** This runner's own result page, when one result in the race carries their name. */
  resultHref: string | null;
};

export type TrackView = {
  /** Short-lived, this scope only: what Resend proves itself with. */
  token: string;
  orderRef: string;
  wholeOrder: boolean;
  runnersOnOrder: number;
  event: {
    title: string;
    when: string;
    where: string;
    href: string;
    finished: boolean;
    registerHref: string | null;
    resultsHref: string | null;
    resultsComing: boolean;
  };
  status: TrackStatus & {
    /** The contact's first name, when the person looking is not the one who registered. */
    registeredBy: string | null;
  };
  logistics:
    | { method: 'pickup'; label: string; location: string | null; schedule: string | null; fallback: string }
    | { method: 'delivery'; area: string; shipsTo: string; perRunner: boolean };
  pending: TrackPending[];
  runners: TrackRunner[];
  /** Which email Resend sends, or null when this order is owed none it could resend. */
  resend: { kind: EmailKind; to: string } | null;
};

/** The registration as the page reads it. The whitelist: nothing else leaves here. */
async function readOrder(registrationId: string) {
  return prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      orderRef: true,
      status: true,
      paymentMethod: true,
      createdAt: true,
      holdUntil: true,
      expiredAt: true,
      deletedAt: true,
      customerName: true,
      customerEmail: true,
      confirmationEmailSentAt: true,
      logisticsMethod: true,
      deliveryZone: true,
      deliveryAddress: true,
      deliverySplit: true,
      _count: { select: { runners: { where: { deletedAt: { not: null } } } } },
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          date: true,
          virtualEndDate: true,
          location: true,
          format: true,
          eventType: true,
          resultsOnly: true,
          timedResults: true,
          pickupLocation: true,
          pickupSchedule: true,
          logisticsDeliveryFeeInside: true,
          logisticsDeliveryFeeOutside: true,
          client: EVENT_SITE_CLIENT,
        },
      },
      runners: {
        where: { deletedAt: null },
        orderBy: { runnerNo: 'asc' },
        select: {
          id: true,
          runnerNo: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          gender: true,
          birthdate: true,
          singletSize: true,
          runningCommunity: true,
          addressCity: true,
          addressProvince: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          medicalConditions: true,
          guardianName: true,
          guardianRelationship: true,
          category: { select: { name: true, inclusions: true } },
        },
      },
    },
  });
}

type Order = NonNullable<Awaited<ReturnType<typeof readOrder>>>;

/** Each shown runner's own result, matched by name when exactly one row carries it. */
async function resultLinks(order: Order, shown: Order['runners']): Promise<{ any: boolean; byRunner: Map<string, string> }> {
  const byRunner = new Map<string, string>();
  const any = (await prisma.raceResult.count({ where: { eventId: order.event.id } })) > 0;
  if (!any) return { any, byRunner };
  const names = shown.map(r => `${r.firstName} ${r.lastName}`.trim());
  const rows = await prisma.raceResult.findMany({
    where: { eventId: order.event.id, OR: names.map(name => ({ name: { equals: name, mode: 'insensitive' as const } })) },
    select: { id: true, bibNumber: true, name: true },
  });
  for (const runner of shown) {
    const name = `${runner.firstName} ${runner.lastName}`.trim();
    const matches = rows.filter(row => same(row.name, name));
    if (matches.length === 1) byRunner.set(runner.id, runnerResultPath(order.event, matches[0]));
  }
  return { any, byRunner };
}

function logisticsOf(order: Order): TrackView['logistics'] {
  const { event } = order;
  if (asLogisticsMethod(order.logisticsMethod) !== LOGISTICS_METHODS.DELIVERY) {
    const { location, schedule } = pickupDetails(event);
    return { method: 'pickup', label: pickupLabel(event), location, schedule, fallback: PICKUP_FALLBACK };
  }
  const parts = parseDeliveryAddress(order.deliveryAddress);
  return {
    method: 'delivery',
    area: deliveryZoneLabelFor(event, order.deliveryZone),
    // D9: an address the parser cannot split (the old single box) shows
    // nothing rather than its street.
    shipsTo: order.deliverySplit ? '' : cityProvince(parts.city, parts.province),
    perRunner: order.deliverySplit,
  };
}

function resendOf(order: Order): TrackView['resend'] {
  const to = maskEmail(order.customerEmail);
  if (order.status === 'PAID') return { kind: EMAIL_KINDS.CONFIRMATION, to };
  if (order.status === 'PENDING' && isBankTransfer(order.paymentMethod)) return { kind: EMAIL_KINDS.RECEIVED, to };
  return null;
}

/**
 * The page's whole view of a scope, masked, or null when the order or every
 * runner it names is gone. `requestUrl` decides the host the pay links open on.
 */
export async function readTrackView(scope: TrackScope, requestUrl: string, now: Date = new Date()): Promise<TrackView | null> {
  const order = await readOrder(scope.registrationId);
  if (!order || order.deletedAt || order.runners.length === 0) return null;

  const runnersOnOrder = order.runners.length;
  const shown = scope.runnerNos
    ? order.runners.filter(runner => scope.runnerNos!.includes(runner.runnerNo))
    : order.runners;
  if (shown.length === 0) return null;

  const { event } = order;
  const finished = hasFinished(event);
  const [status, pending, results, token] = await Promise.all([
    statusOf({ ...order, removedRunners: order._count.runners }, runnersOnOrder, requestUrl, now),
    pendingFor(order, shown.map(r => r.id), runnersOnOrder, requestUrl),
    finished && takesResults(event) ? resultLinks(order, shown) : Promise.resolve({ any: false, byRunner: new Map<string, string>() }),
    createTrackToken(scope, new Date(now.getTime() + LOOKUP_TOKEN_MINUTES * 60_000)),
  ]);

  // The payer is named only to a runner who is not them: none of the runners
  // shown registered with the contact's email.
  const registeredBy =
    scope.runnerNos && !shown.some(runner => same(runner.email, order.customerEmail))
      ? order.customerName.trim().split(/\s+/)[0] || null
      : null;

  return {
    token,
    orderRef: order.orderRef,
    wholeOrder: scope.runnerNos === null,
    runnersOnOrder,
    event: {
      title: event.title,
      when: isVirtual(event) ? formatEventRange(event.date, event.virtualEndDate) : formatEventDay(event.date),
      where: isVirtual(event) ? VIRTUAL_RUN_WHERE : event.location,
      href: `/events/${event.slug}`,
      finished,
      registerHref: finished ? null : `/events/${event.slug}/register`,
      resultsHref: results.any ? resultsPath(event) : null,
      resultsComing: finished && !results.any && awaitingResults(event),
    },
    status: { ...status, registeredBy },
    logistics: logisticsOf(order),
    pending,
    runners: shown.map(runner => ({
      ref: runnerRef(order.orderRef, runner.runnerNo, runnersOnOrder),
      name: `${runner.firstName} ${runner.lastName}`.trim(),
      gender: runner.gender,
      category: runner.category.name,
      inclusions: runner.category.inclusions,
      size: runner.singletSize ? chartSize(runner.singletSize) : '',
      club: runner.runningCommunity,
      email: maskEmail(runner.email),
      phone: maskPhone(runner.phone),
      birth: birthMonthYear(runner.birthdate),
      address: cityProvince(runner.addressCity, runner.addressProvince),
      emergencyName: runner.emergencyContactName,
      emergencyPhone: maskPhoneTail(runner.emergencyContactPhone),
      medical: medicalLine(runner.medicalConditions),
      guardian: runner.guardianName
        ? { name: runner.guardianName, relationship: runner.guardianRelationship ?? '' }
        : null,
      resultHref: results.byRunner.get(runner.id) ?? null,
    })),
    resend: resendOf(order),
  };
}

/**
 * **Which site an order is tracked on** (the owner, 2026-10-23): its race's,
 * as `/pay/[token]` is (`ensureEventHost`) — the client's site for a client's
 * race, the main site for every other. A lookup on the wrong site is pointed
 * at the right one rather than shown under another organizer's branding, which
 * read as though the race were theirs. Only after the reference and email
 * matched, so it tells a stranger nothing a "not found" would not.
 *
 * `siteName` is what the pointer calls the other site: the client's name, or
 * null for Run As One's own.
 */
export async function trackHome(registrationId: string) {
  const order = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      event: {
        select: { title: true, client: { select: { name: true, subdomain: true, status: true } } },
      },
    },
  });
  if (!order) return null;
  const { event } = order;
  const label = siteLabelOf(event.client);
  return { event, label, siteName: label ? event.client!.name : null };
}

/** The order and the email a Resend sends, for a scope a token proved. */
export async function readResendTarget(registrationId: string) {
  return prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: true, runners: { where: { deletedAt: null }, orderBy: { runnerNo: 'asc' }, include: { category: true } } },
  });
}
