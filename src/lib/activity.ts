/**
 * Reading the trail back: what each recorded action is called (re-exported
 * from `activity-actions.ts`), how the activity screen's filters are spelled
 * in its URL, and how a line of the trail is put in front of a person
 * (STAFF_ACCESS_PLAN.md, Batch 3).
 *
 * `audit.ts` writes the trail and this module reads it. They are two files
 * because the reading half is imported by client components — the activity
 * screen and the registrants table — and `audit.ts` reads request headers,
 * which a browser bundle cannot. Everything here is free of Prisma and of
 * `next/headers`; the queries themselves are `activity-store.ts`.
 *
 * **Every action has a label and a group, checked by the compiler.** Both are
 * `Record<AuditAction, …>` (in `activity-actions.ts`), so a verb added to `AUDIT_ACTIONS` without a name
 * here fails the build rather than appearing on screen as a dotted string —
 * and a row with no group could never be found by the Activity filter.
 *
 * **The filters live in the URL.** A link from an order's detail modal lands
 * on that order's history, a filtered view survives a reload, and the back
 * button undoes a filter. `asOf` is in there too: it pins the list to the
 * moment somebody started reading, so entries recorded while they page back
 * through yesterday wait above rather than pushing every row down one.
 */

export * from './activity-actions';
import { actionsForFilter } from './activity-actions';
import { eventInstant, eventInstantParts, isCalendarDay, today } from './event-schedule';

export const ACTOR_KIND_LABELS: Record<string, string> = {
  OWNER: 'Super Admin',
  STAFF: 'Staff',
  // The retired super admin account (ADMIN_MERGE_PLAN.md, Batch 5). Nothing
  // writes it any more; older rows still read it.
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
  /** Actor ids and/or `SYSTEM_PERSON`; empty for everyone. Any of them matches. */
  person: string[];
  /** Event ids; empty for every event and for what belongs to none. */
  event: string[];
  /** Verbs and/or `group:<key>`; empty for everything. Any of them matches. */
  action: string[];
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

/**
 * A filter that may hold several values: the Filters sheet checks more than
 * one, and the URL carries them comma-separated (`person=a,b`) — none of the
 * values it can produce contains a comma. Repeated params are read too, blanks
 * and repeats dropped, and the list capped so an address cannot grow a query.
 */
function list(value: string | string[] | undefined): string[] {
  const parts = (Array.isArray(value) ? value : [value ?? ''])
    .flatMap(part => part.split(','))
    .map(part => part.trim())
    .filter(Boolean);
  return [...new Set(parts)].slice(0, MAX_LIST);
}

/** More than any sheet offers: every shelf and verb, or every race. */
const MAX_LIST = 100;

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

  const action = list(params.action).filter(value => actionsForFilter(value));

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
      person: list(params.person).filter(value => value === SYSTEM_PERSON || asId(value)),
      event: list(params.event).filter(value => asId(value)),
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
  return Boolean(
    filters.person.length || filters.event.length || filters.action.length || filters.q || filters.range !== 'all',
  );
}

/** The query string for a set of filters, leaving out every default. */
export function activityQuery(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters.person.length) params.set('person', filters.person.join(','));
  if (filters.event.length) params.set('event', filters.event.join(','));
  if (filters.action.length) params.set('action', filters.action.join(','));
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

/**
 * The latest recorded change to an order's status: who, when, from what and
 * to what, and the reason given when one was (Cancel order… on the Unpaid
 * checkouts tab asks for one). `from` is what tells an order cancelled while
 * unpaid from a paid one cancelled later (`isCancelledCheckout`).
 */
export type StatusRecord = { by: string; at: string; from: string | null; to: string; reason: string | null };

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
 *
 * **How the order was paid arrives as an object, not a bare boolean**, because
 * there are now three answers and not two. A complimentary order
 * (`PACER_DISCOUNT_PLAN.md`) is written PAID by the free-checkout path and
 * never reaches PayMongo, so the online sentence would be a plain untruth
 * under its badge — and a boolean in a positional slot is exactly how the
 * third case gets missed.
 */
export function statusProvenance(
  status: string,
  paidBy: { isBankTransfer: boolean; isComplimentary: boolean },
  record: StatusRecord | null,
): string | null {
  const current = status.toUpperCase();
  if (record && record.to.toUpperCase() === current && STATUS_VERBS[current]) {
    return `${STATUS_VERBS[current]} by ${record.by} · ${formatTrailInstant(record.at)}`;
  }
  if (current === 'PAID') {
    // Nobody settled it and nobody has to: the order was ₱0, so checkout
    // wrote it paid on the spot. Saying so is the whole line — there is no
    // person to name and no payment to trace.
    if (paidBy.isComplimentary) return 'Free entry — nothing was charged, so there was nothing to settle.';
    return paidBy.isBankTransfer
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
