/**
 * The notification queries, server-only — see `notifications.ts` for what a
 * notification is and why none is stored.
 *
 * **Each kind is asked of the permission that opens its screen**, so the feed
 * can never link somebody to a page that would answer them with a 404:
 *
 * | Kind | Permission | Goes to |
 * | --- | --- | --- |
 * | `payment.validate` | `registration:validate` on the race | its registrants, searched to the order |
 * | `registration.paid` | `registration:view` on the race | the same |
 * | `email.unsent` | `registration:email` on the race | the same |
 * | `client.new`, `feedback.new`, `community.pending` | `platform:manage` | Clients, Feedback, Communities |
 * | `team.joined` | `team:manage` | Team |
 * | `viewer.registrations` | a client viewer's `event:view-summary` | its Overview |
 *
 * Every query is bounded twice — by `NOTIFICATION_WINDOW_DAYS` and by
 * `NOTIFICATION_KIND_LIMIT` rows — and they run together, so the bell costs a
 * handful of indexed reads a minute per open dashboard.
 */

import prisma from './db';
import { can, isClientViewer, reachableEvents, type Actor } from './actor';
import { PAYMENT_METHODS } from './registration-codes';
import { EMAIL_KIND_LABELS, outstandingEmail } from './email-delivery';
import { feedbackKindLabel } from './feedback';
import { ROLE_LABELS } from './permissions';
import { trailDay } from './activity';
import {
  NOTIFICATION_KIND_LIMIT,
  NOTIFICATION_LIMIT,
  NOTIFICATION_WINDOW_DAYS,
  type AppNotification,
} from './notifications';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A client viewer's feed looks back a week: it is a pulse, not a ledger. */
const VIEWER_WINDOW_DAYS = 7;

function registrantsHref(eventId: string, orderRef: string): string {
  return `/admin/events/${eventId}/registrants?search=${encodeURIComponent(orderRef)}`;
}

function runnerName(runner: { firstName: string; lastName: string } | undefined): string {
  return runner ? `${runner.firstName} ${runner.lastName}`.trim() : 'A runner';
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export async function loadNotifications(actor: Actor, now: Date = new Date()): Promise<AppNotification[]> {
  return isClientViewer(actor) ? viewerNotifications(actor, now) : teamNotifications(actor, now);
}

async function teamNotifications(actor: Actor, now: Date): Promise<AppNotification[]> {
  const since = new Date(now.getTime() - NOTIFICATION_WINDOW_DAYS * DAY_MS);
  const org = { organizerId: actor.orgId };
  const platform = can(actor, 'platform:manage', org);
  const team = can(actor, 'team:manage', org);

  // The first runner is the one the order is filed under.
  const orderShape = {
    id: true,
    orderRef: true,
    eventId: true,
    createdAt: true,
    status: true,
    receivedEmailSentAt: true,
    confirmationEmailSentAt: true,
    event: { select: { title: true } },
    runners: {
      where: { deletedAt: null },
      orderBy: { runnerNo: 'asc' as const },
      select: { firstName: true, lastName: true },
    },
  };

  const none = Promise.resolve([]);

  const [toValidate, paid, unsent, clients, feedback, clubs, joined] = await Promise.all([
    prisma.registration.findMany({
      where: {
        event: reachableEvents(actor, 'registration:validate'),
        status: 'PENDING',
        paymentMethod: { equals: PAYMENT_METHODS.BANK_TRANSFER, mode: 'insensitive' },
        deletedAt: null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: NOTIFICATION_KIND_LIMIT,
      select: orderShape,
    }),
    prisma.registration.findMany({
      where: {
        event: reachableEvents(actor, 'registration:view'),
        status: 'PAID',
        deletedAt: null,
        createdAt: { gte: since },
      },
      // createdAt, not updatedAt: a remark or an edit touches updatedAt, and
      // an order must not come back as "new" because somebody fixed a typo.
      orderBy: { createdAt: 'desc' },
      take: NOTIFICATION_KIND_LIMIT,
      select: orderShape,
    }),
    prisma.registration.findMany({
      where: {
        event: reachableEvents(actor, 'registration:email'),
        deletedAt: null,
        createdAt: { gte: since },
        // outstandingEmail's rule, as a where: the received email never
        // went out, or the order is paid and its receipt never did.
        OR: [
          { receivedEmailSentAt: null },
          { status: 'PAID', confirmationEmailSentAt: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: NOTIFICATION_KIND_LIMIT,
      select: orderShape,
    }),
    platform
      ? prisma.client.findMany({
          where: { status: 'NEW', createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: NOTIFICATION_KIND_LIMIT,
          select: { id: true, name: true, createdAt: true },
        })
      : none,
    platform
      ? prisma.feedback.findMany({
          where: { status: 'NEW', createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: NOTIFICATION_KIND_LIMIT,
          select: { id: true, kind: true, name: true, message: true, createdAt: true },
        })
      : none,
    platform
      ? prisma.runningCommunity.findMany({
          where: { status: 'PENDING', createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take: NOTIFICATION_KIND_LIMIT,
          select: { id: true, name: true, createdAt: true },
        })
      : none,
    team
      ? prisma.staffMembership.findMany({
          where: {
            organizerId: actor.orgId,
            acceptedAt: { gte: since },
            // A client viewer is not a team member (TEAM_ROLES).
            role: { in: ['ADMIN', 'STAFF'] },
          },
          orderBy: { acceptedAt: 'desc' },
          take: NOTIFICATION_KIND_LIMIT,
          select: { id: true, role: true, acceptedAt: true, staff: { select: { name: true } } },
        })
      : none,
  ]);

  const items: AppNotification[] = [];

  for (const order of toValidate) {
    items.push({
      id: `payment.validate:${order.id}`,
      kind: 'payment.validate',
      title: 'Payment to validate',
      body: `${runnerName(order.runners[0])} sent a bank transfer for ${order.event.title} (${order.orderRef}).`,
      href: registrantsHref(order.eventId, order.orderRef),
      at: order.createdAt.toISOString(),
      actionable: true,
    });
  }

  for (const order of paid) {
    const count = order.runners.length;
    items.push({
      id: `registration.paid:${order.id}`,
      kind: 'registration.paid',
      title: 'New paid registration',
      body:
        count > 1
          ? `${runnerName(order.runners[0])} and ${plural(count - 1, 'other')} are in for ${order.event.title} (${order.orderRef}).`
          : `${runnerName(order.runners[0])} is in for ${order.event.title} (${order.orderRef}).`,
      href: registrantsHref(order.eventId, order.orderRef),
      at: order.createdAt.toISOString(),
      actionable: false,
    });
  }

  for (const order of unsent) {
    const kind = outstandingEmail(order);
    if (!kind) continue;
    items.push({
      id: `email.unsent:${order.id}:${kind}`,
      kind: 'email.unsent',
      title: 'Email not delivered',
      body: `${runnerName(order.runners[0])} never got the ${EMAIL_KIND_LABELS[kind]} email for ${order.event.title} (${order.orderRef}).`,
      href: registrantsHref(order.eventId, order.orderRef),
      at: order.createdAt.toISOString(),
      actionable: true,
    });
  }

  for (const client of clients) {
    items.push({
      id: `client.new:${client.id}`,
      kind: 'client.new',
      title: 'New client application',
      body: `${client.name} applied to have Run As One run their race.`,
      href: '/admin/clients',
      at: client.createdAt.toISOString(),
      actionable: true,
    });
  }

  for (const message of feedback) {
    const excerpt = message.message.length > 90 ? `${message.message.slice(0, 90).trimEnd()}…` : message.message;
    items.push({
      id: `feedback.new:${message.id}`,
      kind: 'feedback.new',
      title: `New feedback · ${feedbackKindLabel(message.kind)}`,
      body: `${message.name?.trim() || 'Someone'}: “${excerpt}”`,
      href: '/admin/feedback',
      at: message.createdAt.toISOString(),
      actionable: true,
    });
  }

  for (const club of clubs) {
    items.push({
      id: `community.pending:${club.id}`,
      kind: 'community.pending',
      title: 'Club waiting for review',
      body: `A runner wrote in ${club.name}. Approve it to add it to the club list.`,
      href: '/admin/communities',
      at: club.createdAt.toISOString(),
      actionable: true,
    });
  }

  for (const member of joined) {
    if (!member.acceptedAt) continue;
    items.push({
      id: `team.joined:${member.id}`,
      kind: 'team.joined',
      title: 'Joined the team',
      body: `${member.staff.name} accepted the invitation as ${ROLE_LABELS[member.role as 'ADMIN' | 'STAFF'] ?? member.role}.`,
      href: '/admin/team',
      at: member.acceptedAt.toISOString(),
      actionable: false,
    });
  }

  return newestFirst(items);
}

/**
 * A client viewer hears one thing: how many runners registered for each of
 * its races, day by day. Counts only — no names, no references, no money —
 * and it links to the Overview, the one screen that is theirs.
 */
async function viewerNotifications(actor: Actor, now: Date): Promise<AppNotification[]> {
  const since = new Date(now.getTime() - VIEWER_WINDOW_DAYS * DAY_MS);

  const runners = await prisma.runner.findMany({
    where: {
      deletedAt: null,
      registration: {
        event: reachableEvents(actor, 'event:view-summary'),
        status: { in: ['PAID', 'PENDING'] },
        createdAt: { gte: since },
      },
    },
    select: {
      registration: {
        select: { createdAt: true, eventId: true, event: { select: { title: true } } },
      },
    },
  });

  const byEventDay = new Map<string, { eventId: string; title: string; day: string; count: number; latest: Date }>();
  for (const { registration } of runners) {
    const day = trailDay(registration.createdAt);
    const key = `${registration.eventId}:${day}`;
    const entry = byEventDay.get(key);
    if (entry) {
      entry.count += 1;
      if (registration.createdAt > entry.latest) entry.latest = registration.createdAt;
    } else {
      byEventDay.set(key, {
        eventId: registration.eventId,
        title: registration.event.title,
        day,
        count: 1,
        latest: registration.createdAt,
      });
    }
  }

  const items: AppNotification[] = [...byEventDay.values()].map(entry => ({
    // The count is in the id, so a day that gains runners reads as news again.
    id: `viewer.registrations:${entry.eventId}:${entry.day}:${entry.count}`,
    kind: 'viewer.registrations',
    title: 'New registrations',
    body: `${plural(entry.count, 'runner')} registered for ${entry.title}.`,
    href: '/admin',
    at: entry.latest.toISOString(),
    actionable: false,
  }));

  return newestFirst(items);
}

function newestFirst(items: AppNotification[]): AppNotification[] {
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, NOTIFICATION_LIMIT);
}
