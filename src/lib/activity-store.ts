/**
 * The trail's queries, for the activity screen and the registrants screen.
 *
 * Kept apart from `activity.ts` for the reason `promo-store.ts` is kept apart
 * from `discount.ts`: the rules and labels are imported by client components,
 * and this file imports Prisma.
 *
 * **Every read is scoped to one organizer.** `AuditLog.organizerId` is the
 * tenant the entry belongs to — with one tenant (ADMIN_MERGE_PLAN.md) that is
 * always Run As One's row — so an owner or admin reads
 * everything that happened to their own data, and nothing that happened to
 * anyone else's.
 */

import type { Prisma } from '@prisma/client';
import prisma from './db';
import {
  SYSTEM_PERSON,
  actionsForFilter,
  activityWindow,
  readActivityFilters,
  type ActivityFilterErrors,
  type ActivityFilters,
  type StatusRecord,
} from './activity';

/** One line of the trail as both activity screens hand it to `ActivityClient`. */
export type ActivityEntry = {
  id: string;
  at: string;
  actorKind: string;
  actorName: string;
  actorEmail: string | null;
  action: string;
  eventId: string | null;
  summary: string;
  changes: unknown;
  ip: string | null;
  userAgent: string | null;
};

/**
 * One page of one organizer's trail, for a set of URL filters — everything an
 * activity screen needs except the names of its events, which only the
 * organizer screen has. It served `/superadmin/activity` too until the
 * dashboards merged, and stays the one reading of the trail.
 *
 * **The reading is pinned** with `asOf` once somebody pages past the first
 * screen, so an entry recorded mid-read is counted in `newer` instead of
 * shifting every row. The trail is append-only, so an offset against a pinned
 * instant is exactly stable. A page past the end lands on the last page there is.
 */
export async function loadActivityPage(
  organizerId: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const now = new Date();
  const { filters, errors } = readActivityFilters(searchParams, now);
  const asOf = filters.asOf ? new Date(filters.asOf) : now;
  const base = activityWhere(organizerId, filters, errors, now);
  const pinned = { AND: [base, { createdAt: { lte: asOf } }] };

  const [total, newer, people] = await Promise.all([
    prisma.auditLog.count({ where: pinned }),
    filters.asOf
      ? prisma.auditLog.count({ where: { AND: [base, { createdAt: { gt: asOf } }] } })
      : Promise.resolve(0),
    activityPeople(organizerId),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / filters.size));
  const page = Math.min(filters.page, lastPage);

  const found = await prisma.auditLog.findMany({
    where: pinned,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * filters.size,
    take: filters.size,
    select: {
      id: true,
      createdAt: true,
      actorKind: true,
      actorName: true,
      actorEmail: true,
      action: true,
      eventId: true,
      summary: true,
      changes: true,
      ip: true,
      userAgent: true,
    },
  });

  const entries: ActivityEntry[] = found.map(entry => ({
    id: entry.id,
    at: entry.createdAt.toISOString(),
    actorKind: entry.actorKind,
    actorName: entry.actorName,
    actorEmail: entry.actorEmail,
    action: entry.action,
    eventId: entry.eventId,
    summary: entry.summary,
    changes: entry.changes ?? null,
    ip: entry.ip,
    userAgent: entry.userAgent,
  }));

  return {
    entries,
    total,
    newer,
    people,
    errors,
    /** As applied, with `asOf` always set to the reading's instant. */
    filters: { ...filters, page, asOf: asOf.toISOString() },
    /** Whether the URL already pinned the reading. */
    pinned: Boolean(filters.asOf),
    now: now.toISOString(),
  };
}

/**
 * The `where` for a set of filters, before the reading is pinned. The page
 * adds `createdAt <= asOf` for the list and `> asOf` for the count of newer
 * entries, so both read the same filters.
 */
export function activityWhere(
  organizerId: string,
  filters: ActivityFilters,
  errors: ActivityFilterErrors,
  now: Date = new Date(),
): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [{ organizerId }];

  if (filters.person === SYSTEM_PERSON) and.push({ actorId: null });
  else if (filters.person) and.push({ actorId: filters.person });

  if (filters.event) and.push({ eventId: filters.event });

  const actions = actionsForFilter(filters.action);
  if (actions) and.push({ action: { in: actions } });

  const window = activityWindow(filters, errors, now);
  if (window.gte || window.lt) {
    and.push({ createdAt: { ...(window.gte ? { gte: window.gte } : {}), ...(window.lt ? { lt: window.lt } : {}) } });
  }

  // The summary is the sentence a person reads, and it names what they would
  // search by: an order reference, a runner, an event, a promotion. A
  // case-insensitive scan is fine at the trail's size (§4.4: ~20,000 rows a
  // busy year) once the organizer index has narrowed it.
  if (filters.q) and.push({ summary: { contains: filters.q, mode: 'insensitive' } });

  return { AND: and };
}

export type ActivityPerson = { value: string; name: string; email: string | null; kind: string };

/**
 * Everyone who appears in this organizer's trail, for the Person filter.
 *
 * Read from the trail rather than from the team, because the trail outlives
 * the team: a removed freelancer's validations still need to be findable by
 * their name. Grouped by id, and named by the most recent snapshot, so a
 * person who renamed themselves appears once, as they are called now.
 */
export async function activityPeople(organizerId: string): Promise<ActivityPerson[]> {
  const groups = await prisma.auditLog.groupBy({
    by: ['actorId', 'actorName', 'actorEmail', 'actorKind'],
    where: { organizerId },
    _max: { createdAt: true },
  });

  const people = new Map<string, ActivityPerson & { last: number }>();
  for (const group of groups) {
    const value = group.actorId ?? SYSTEM_PERSON;
    const last = group._max.createdAt?.getTime() ?? 0;
    const known = people.get(value);
    if (!known || last > known.last) {
      people.set(value, {
        value,
        name: group.actorId ? group.actorName : 'System',
        email: group.actorEmail,
        kind: group.actorId ? group.actorKind : 'SYSTEM',
        last,
      });
    }
  }

  return [...people.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(person => ({ value: person.value, name: person.name, email: person.email, kind: person.kind }));
}

/**
 * The latest recorded status change of every order on one event, by
 * registration id — what the registrant detail modal's "Validated by" line
 * reads. One query for the whole screen, newest first, keeping the first
 * entry seen per order.
 */
export async function latestStatusChanges(
  organizerId: string,
  eventId: string,
): Promise<Map<string, StatusRecord>> {
  const entries = await prisma.auditLog.findMany({
    where: { organizerId, eventId, action: 'registration.status.changed' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { entityId: true, actorName: true, createdAt: true, changes: true },
  });

  const latest = new Map<string, StatusRecord>();
  for (const entry of entries) {
    if (!entry.entityId || latest.has(entry.entityId)) continue;
    const moved = (entry.changes as { status?: unknown } | null)?.status;
    const to = Array.isArray(moved) && typeof moved[1] === 'string' ? moved[1] : null;
    if (!to) continue;
    latest.set(entry.entityId, { by: entry.actorName, at: entry.createdAt.toISOString(), to });
  }
  return latest;
}
