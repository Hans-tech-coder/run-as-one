/**
 * Reading the trail back: what each recorded action is called, how the
 * activity screen's filters are spelled in its URL, and how a line of the
 * trail is put in front of a person (STAFF_ACCESS_PLAN.md, Batch 3).
 *
 * `audit.ts` writes the trail and this module reads it. They are two files
 * because the reading half is imported by client components — the activity
 * screen and the registrants table — and `audit.ts` reads request headers,
 * which a browser bundle cannot. Everything here is free of Prisma and of
 * `next/headers`; the queries themselves are `activity-store.ts`.
 *
 * **Every action has a label and a group, checked by the compiler.** Both are
 * `Record<AuditAction, …>`, so a verb added to `AUDIT_ACTIONS` without a name
 * here fails the build rather than appearing on screen as a dotted string —
 * and a row with no group could never be found by the Activity filter.
 *
 * **The filters live in the URL.** A link from an order's detail modal lands
 * on that order's history, a filtered view survives a reload, and the back
 * button undoes a filter. `asOf` is in there too: it pins the list to the
 * moment somebody started reading, so entries recorded while they page back
 * through yesterday wait above rather than pushing every row down one.
 */

import type { AuditAction } from './audit';
import { eventInstant, eventInstantParts, isCalendarDay, today } from './event-schedule';

// ── What each action is called ──────────────────────────────────────────────

export const ACTION_LABELS: Record<AuditAction, string> = {
  'auth.signed_in': 'Signed in',
  'auth.sign_in_failed': 'Failed sign-in',
  'auth.organizer.switched': 'Switched organizer',
  'staff.invited': 'Invited a member',
  'staff.invitation.resent': 'Resent an invitation',
  'staff.invitation.accepted': 'Accepted an invitation',
  'staff.access.changed': 'Changed access',
  'staff.suspended': 'Suspended a member',
  'staff.reinstated': 'Reinstated a member',
  'staff.removed': 'Removed a member',
  'profile.updated': 'Updated profile',
  'profile.password.changed': 'Changed password',
  'organizer.approved': 'Approved the account',
  'organizer.rejected': 'Rejected the application',
  'organizer.suspended': 'Suspended the account',
  'organizer.reinstated': 'Reinstated the account',
  'event.created': 'Created an event',
  'event.updated': 'Edited an event',
  'event.registration.paused': 'Paused sign-ups',
  'event.registration.resumed': 'Resumed sign-ups',
  'event.registration.scheduled': 'Scheduled sign-ups',
  'event.deleted': 'Deleted an event',
  'results.uploaded': 'Uploaded results',
  'registration.status.changed': 'Changed payment status',
  'registration.remarks.changed': 'Changed remarks',
  'registration.email.sent_by_hand': 'Sent an email by hand',
  'runner.updated': 'Edited a runner',
  'runner.deleted': 'Removed a runner',
  'proof.viewed': 'Opened a payment proof',
  'registrants.exported': 'Exported registrants',
  'promo.created': 'Created a promotion',
  'promo.updated': 'Edited a promotion',
  'promo.paused': 'Paused a promotion',
  'promo.resumed': 'Resumed a promotion',
  'promo.deleted': 'Deleted a promotion',
};

/** The one action worded as a warning: somebody tried a password and was refused. */
export function isWarningAction(action: string): boolean {
  return action === 'auth.sign_in_failed';
}

/**
 * The shelves the Activity filter offers before the single verbs. An owner
 * tracing an argument about a payment wants "everything about payments", not
 * to remember that remarks and hand-sent emails are separate verbs.
 *
 * **Personal data** is its own group on purpose: opening a proof and exporting
 * a list are the two ways a runner's data leaves the system without anything
 * changing, which is exactly what a Data Privacy Act review asks for first.
 */
export const ACTIVITY_GROUPS = [
  { key: 'payments', label: 'Payments', hint: 'Status changes, remarks and emails sent by hand' },
  { key: 'runners', label: 'Runners', hint: 'Runner edits and removals' },
  { key: 'data', label: 'Personal data', hint: 'Payment proofs opened and registrant lists exported' },
  { key: 'events', label: 'Events', hint: 'Events created, edited, paused, scheduled or deleted, and results uploaded' },
  { key: 'promotions', label: 'Promotions', hint: 'Promotions created, edited, paused or deleted' },
  { key: 'team', label: 'Team', hint: 'Invitations, access changes, suspensions and removals' },
  { key: 'access', label: 'Sign-ins', hint: 'Sign-ins, failed sign-ins, and profile or password changes' },
  { key: 'organizers', label: 'Organizer decisions', hint: 'Applications approved or rejected, accounts suspended or reinstated' },
] as const;

export type ActivityGroupKey = (typeof ACTIVITY_GROUPS)[number]['key'];

export const ACTION_GROUP: Record<AuditAction, ActivityGroupKey> = {
  'auth.signed_in': 'access',
  'auth.sign_in_failed': 'access',
  'auth.organizer.switched': 'access',
  'profile.updated': 'access',
  'profile.password.changed': 'access',
  'organizer.approved': 'organizers',
  'organizer.rejected': 'organizers',
  'organizer.suspended': 'organizers',
  'organizer.reinstated': 'organizers',
  'staff.invited': 'team',
  'staff.invitation.resent': 'team',
  'staff.invitation.accepted': 'team',
  'staff.access.changed': 'team',
  'staff.suspended': 'team',
  'staff.reinstated': 'team',
  'staff.removed': 'team',
  'event.created': 'events',
  'event.updated': 'events',
  'event.registration.paused': 'events',
  'event.registration.resumed': 'events',
  'event.registration.scheduled': 'events',
  'event.deleted': 'events',
  'results.uploaded': 'events',
  'registration.status.changed': 'payments',
  'registration.remarks.changed': 'payments',
  'registration.email.sent_by_hand': 'payments',
  'runner.updated': 'runners',
  'runner.deleted': 'runners',
  'proof.viewed': 'data',
  'registrants.exported': 'data',
  'promo.created': 'promotions',
  'promo.updated': 'promotions',
  'promo.paused': 'promotions',
  'promo.resumed': 'promotions',
  'promo.deleted': 'promotions',
};

const KNOWN_ACTIONS = Object.keys(ACTION_LABELS) as AuditAction[];

/**
 * Where the trail is read. There used to be two screens — this one and the
 * super admin's `/superadmin/activity` — and a scope telling them apart. With
 * one dashboard (ADMIN_MERGE_PLAN.md, Batch 2) Run As One's staff decide
 * organizer applications inside Run As One's own tenant, so those decisions
 * land in the same trail as everything else and the Activity filter offers
 * every shelf in `ACTIVITY_GROUPS`. A decision is still never written into the
 * applicant's trail: the applicant is a different Organizer row.
 */
export const ACTIVITY_PATH = '/admin/activity';

export function asAuditAction(value: unknown): AuditAction | null {
  return typeof value === 'string' && (KNOWN_ACTIONS as string[]).includes(value)
    ? (value as AuditAction)
    : null;
}

/** A row's label, tolerating a verb written by a newer deploy than this one. */
export function actionLabel(action: string): string {
  return asAuditAction(action) ? ACTION_LABELS[action as AuditAction] : action;
}

export function actionGroupLabel(action: string): string | null {
  const known = asAuditAction(action);
  if (!known) return null;
  return ACTIVITY_GROUPS.find(group => group.key === ACTION_GROUP[known])?.label ?? null;
}

/** Every verb on one shelf. */
export function actionsInGroup(key: ActivityGroupKey): AuditAction[] {
  return KNOWN_ACTIONS.filter(action => ACTION_GROUP[action] === key);
}

const GROUP_PREFIX = 'group:';

export function groupFilterValue(key: ActivityGroupKey): string {
  return `${GROUP_PREFIX}${key}`;
}

/** The verbs an Activity filter value stands for, or null for no filter. */
export function actionsForFilter(value: string): AuditAction[] | null {
  if (!value) return null;
  if (value.startsWith(GROUP_PREFIX)) {
    const key = value.slice(GROUP_PREFIX.length);
    const group = ACTIVITY_GROUPS.find(candidate => candidate.key === key);
    return group ? actionsInGroup(group.key) : null;
  }
  const action = asAuditAction(value);
  return action ? [action] : null;
}

export const ACTOR_KIND_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  STAFF: 'Staff',
  SUPER_ADMIN: 'Super Admin',
  SYSTEM: 'System',
};

/** The Person filter's value for rows no person wrote (the cron, a webhook). */
export const SYSTEM_PERSON = 'system';

// ── The filters, as the URL carries them ────────────────────────────────────

export const ACTIVITY_RANGES = ['all', 'today', '7d', '30d', 'custom'] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];

export const ACTIVITY_RANGE_LABELS: Record<ActivityRange, string> = {
  all: 'Any time',
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Choose dates',
};

export const ACTIVITY_PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

/** Long enough for an order reference, a name or an event title. */
const MAX_SEARCH = 100;

export type ActivityFilters = {
  /** A person's actor id, `SYSTEM_PERSON`, or blank for everyone. */
  person: string;
  /** An event id, or blank for every event and for what belongs to none. */
  event: string;
  /** A verb, `group:<key>`, or blank. */
  action: string;
  range: ActivityRange;
  /** Manila calendar days, used only when `range` is custom. */
  from: string;
  to: string;
  /** Words in the entry's sentence — an order reference, a runner's name. */
  q: string;
  /** 1-based. */
  page: number;
  size: number;
  /** The instant the reading was pinned to, as ISO, or null for "now". */
  asOf: string | null;
};

export type ActivityFilterErrors = { from?: string; to?: string };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/** Ids are cuids; anything else in the URL is dropped rather than queried. */
function asId(value: string): string {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : '';
}

/**
 * The filters a URL asks for, each guarded — a hand-edited address must never
 * reach the query as anything but the values this screen can produce — plus
 * the one refusal worth saying out loud: a date range that ends before it
 * starts, named under the box that caused it (PROJECT_GUIDE §8, rule 4).
 */
export function readActivityFilters(
  params: SearchParams,
  now: Date = new Date(),
): { filters: ActivityFilters; errors: ActivityFilterErrors } {
  const errors: ActivityFilterErrors = {};

  const rawAction = first(params.action);
  const action = actionsForFilter(rawAction) ? rawAction : '';

  const rawFrom = first(params.from);
  const rawTo = first(params.to);
  const from = isCalendarDay(rawFrom) ? rawFrom : '';
  const to = isCalendarDay(rawTo) ? rawTo : '';
  if (rawFrom && !from) errors.from = 'Choose the start date from the calendar.';
  if (rawTo && !to) errors.to = 'Choose the end date from the calendar.';

  const rawRange = first(params.range);
  const range: ActivityRange = (ACTIVITY_RANGES as readonly string[]).includes(rawRange)
    ? (rawRange as ActivityRange)
    : rawFrom || rawTo
      ? 'custom'
      : 'all';

  if (range === 'custom' && from && to && from > to) {
    errors.to = 'The end date is before the start date. Pick a day on or after it.';
  }

  const page = Number.parseInt(first(params.page), 10);
  const size = Number.parseInt(first(params.size), 10);

  // A pin in the future is not a reading anyone started; it would hide
  // nothing and only confuse the "newer entries" count.
  const rawAsOf = first(params.asOf);
  const pinned = rawAsOf ? new Date(rawAsOf) : null;
  const asOf =
    pinned && !Number.isNaN(pinned.getTime()) && pinned.getTime() <= now.getTime() + 60_000
      ? pinned.toISOString()
      : null;

  return {
    filters: {
      person: first(params.person) === SYSTEM_PERSON ? SYSTEM_PERSON : asId(first(params.person)),
      event: asId(first(params.event)),
      action,
      range,
      from: range === 'custom' ? from : '',
      to: range === 'custom' ? to : '',
      q: first(params.q).slice(0, MAX_SEARCH),
      page: Number.isFinite(page) && page >= 1 ? page : 1,
      size: (ACTIVITY_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
      asOf,
    },
    errors,
  };
}

/** Whether the list is narrowed by anything a person chose (paging aside). */
export function hasActiveFilters(filters: ActivityFilters): boolean {
  return Boolean(filters.person || filters.event || filters.action || filters.q || filters.range !== 'all');
}

/** The query string for a set of filters, leaving out every default. */
export function activityQuery(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters.person) params.set('person', filters.person);
  if (filters.event) params.set('event', filters.event);
  if (filters.action) params.set('action', filters.action);
  if (filters.range !== 'all') params.set('range', filters.range);
  if (filters.range === 'custom' && filters.from) params.set('from', filters.from);
  if (filters.range === 'custom' && filters.to) params.set('to', filters.to);
  if (filters.q) params.set('q', filters.q);
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.size !== DEFAULT_PAGE_SIZE) params.set('size', String(filters.size));
  if (filters.asOf) params.set('asOf', filters.asOf);
  return params.toString();
}

/** Where an order's own history is — the link from the registrant detail modal. */
export function orderActivityPath(orderRef: string, eventId: string): string {
  return `/admin/activity?${new URLSearchParams({ event: eventId, q: orderRef }).toString()}`;
}

/** "2026-09-15" moved by whole days, as calendar arithmetic rather than hours. */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/**
 * The instants a range covers. A day starts at Manila midnight, not UTC's —
 * "today" on a Vercel server is otherwise eight hours late — and "last 7 days"
 * means today and the six before it, which is how a person counts a week.
 * A custom range with a refused date filters on nothing, so the refusal is
 * shown over the whole trail rather than over an empty list.
 */
export function activityWindow(
  filters: ActivityFilters,
  errors: ActivityFilterErrors,
  now: Date = new Date(),
): { gte?: Date; lt?: Date } {
  const day = today(now);
  const startOf = (value: string) => eventInstant(value, '00:00') ?? undefined;

  switch (filters.range) {
    case 'today':
      return { gte: startOf(day) };
    case '7d':
      return { gte: startOf(shiftDay(day, -6)) };
    case '30d':
      return { gte: startOf(shiftDay(day, -29)) };
    case 'custom':
      if (errors.from || errors.to) return {};
      return {
        gte: filters.from ? startOf(filters.from) : undefined,
        lt: filters.to ? startOf(shiftDay(filters.to, 1)) : undefined,
      };
    default:
      return {};
  }
}

// ── Putting an entry in front of a person ───────────────────────────────────

const MANILA = 'Asia/Manila';

/** "4:02 PM" — under a day heading, the day is already said. */
export function formatTrailTime(value: Date | string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: MANILA, hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

/** "Sep 13, 2026, 4:02:37 PM" — the whole instant, for an entry's details. */
export function formatTrailInstant(value: Date | string, seconds = false): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  }).format(new Date(value));
}

/** The Manila calendar day an entry was recorded on. */
export function trailDay(value: Date | string): string {
  return eventInstantParts(value).day;
}

/**
 * "Today · Sep 15", "Yesterday · Sep 14", "Saturday, Sep 13". The year appears
 * only when it is not this one. `now` is passed in by the page so the server
 * and the browser name the same day across midnight.
 */
export function formatTrailDayHeading(day: string, now: Date | string): string {
  const current = today(new Date(now));
  const [year, month, date] = day.split('-').map(Number);
  const sameYear = day.slice(0, 4) === current.slice(0, 4);
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(new Date(Date.UTC(year, month - 1, date)));

  if (day === current) return `Today · ${short}`;
  if (day === shiftDay(current, -1)) return `Yesterday · ${short}`;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(
    new Date(Date.UTC(year, month - 1, date)),
  );
  return `${weekday}, ${short}`;
}

/** "registrationOpensAt" → "Registration opens at". */
function fieldLabel(field: string): string {
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function readableValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'blank';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^[A-Z][A-Z_]+$/.test(value) && value.includes('_')) {
    // A coded reason (WRONG_PASSWORD) reads as words; a status (PAID) stays
    // exactly as the badge on the registrants screen prints it.
    const words = value.toLowerCase().replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return String(value);
}

export type ChangeLine = { field: string; text: string; redacted: boolean };

/**
 * An entry's `changes`, one line a field. A value the trail deliberately did
 * not keep (a sensitive runner column, a long text) says that in words, so
 * nobody reads "changed" as a bug or goes looking for the value elsewhere.
 */
export function describeChanges(changes: unknown): ChangeLine[] {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return [];
  return Object.entries(changes as Record<string, unknown>).map(([field, value]) => {
    if (value === 'changed') {
      return { field: fieldLabel(field), text: 'Changed. The trail does not keep this value.', redacted: true };
    }
    if (Array.isArray(value) && value.length === 2) {
      return {
        field: fieldLabel(field),
        text: `${readableValue(value[0])} → ${readableValue(value[1])}`,
        redacted: false,
      };
    }
    return { field: fieldLabel(field), text: readableValue(value), redacted: false };
  });
}

/**
 * "Chrome on Android" from a user agent — enough to tell a phone at the venue
 * from a laptop at the office. The whole string stays one tap away.
 */
export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const system = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unrecognised browser';
}

// ── Provenance on an order ──────────────────────────────────────────────────

/** The latest recorded change to an order's status: who, when, and to what. */
export type StatusRecord = { by: string; at: string; to: string };

const STATUS_VERBS: Record<string, string> = {
  PAID: 'Validated',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  PENDING: 'Set back to pending',
  EXPIRED: 'Marked expired',
};

/**
 * The line under an order's status in the registrant detail modal —
 * "Validated by Ana Cruz · Sep 13, 2026, 4:02 PM" — so the question "who
 * marked this paid?" is answered where it is asked instead of in a report.
 *
 * **It only names someone when the trail agrees with the order.** A record
 * whose new status is not the status the order holds now (the PayMongo webhook
 * settled it afterwards, say) describes a past state, and naming that person
 * under today's badge would be the trail putting words in their mouth. Where
 * there is no matching record the line says what is actually known: an online
 * payment was settled by PayMongo, and anything else predates the trail.
 */
export function statusProvenance(
  status: string,
  isBankTransfer: boolean,
  record: StatusRecord | null,
): string | null {
  const current = status.toUpperCase();
  if (record && record.to.toUpperCase() === current && STATUS_VERBS[current]) {
    return `${STATUS_VERBS[current]} by ${record.by} · ${formatTrailInstant(record.at)}`;
  }
  if (current === 'PAID') {
    return isBankTransfer
      ? 'Who validated this is not on record. It was settled before the activity trail began.'
      : 'Paid online through PayMongo.';
  }
  if (current === 'CANCELLED' || current === 'REFUNDED') {
    return 'Who changed this is not on record. It was set before the activity trail began.';
  }
  // PENDING is the state an order starts in, and EXPIRED already explains
  // itself in the modal: neither needs a name to make sense.
  return null;
}
