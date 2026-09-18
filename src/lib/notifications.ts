/**
 * The dashboard's notifications — what the bell counts and its modal lists.
 *
 * **Nothing here is stored.** Every notification is read off a table the app
 * already keeps (a bank transfer waiting at PENDING, a client application
 * still NEW, an email that never went out), so it appears the moment the
 * thing happens and leaves by itself the moment somebody deals with it — a
 * validated payment stops being "a payment to validate" without anyone having
 * to dismiss it twice. No notification table was added, and nothing is
 * written when one is read: the Neon free tier is not spent on a copy of
 * facts the database already holds (`notification-store.ts` reads them).
 *
 * **What a person sees is their permissions**, never their role string: the
 * store asks `can()` / `reachableEvents()` for each kind, so a validator on
 * one race hears about that race's deposit slips and nothing else, the owner
 * and admins also hear about clients, clubs and feedback, and a client viewer
 * hears only how many runners registered for its races — counts, no names,
 * the same line `client-summary.ts` holds.
 *
 * **Read or unread is the reader's browser's**, kept by `NotificationsBell`
 * in localStorage under the person's id: a watermark ("everything before this
 * instant has been seen") plus the ids opened since. It is per device on
 * purpose — the alternative is a column on two account tables and a write on
 * every open, for a badge.
 *
 * Prisma-free, so the bell (a client component) imports the types and labels.
 */

export const NOTIFICATION_KINDS = [
  /** A bank-transfer order at PENDING — somebody uploaded a slip and waits for a person. */
  'payment.validate',
  /** An order that reached PAID. */
  'registration.paid',
  /** An order whose email to the runner never went out (email-delivery.ts). */
  'email.unsent',
  /** A client application still at NEW. */
  'client.new',
  /** A feedback message still at NEW. */
  'feedback.new',
  /** A runner's write-in club waiting at PENDING. */
  'community.pending',
  /** Somebody accepted a team invitation. */
  'team.joined',
  /** A client viewer's own: how many runners registered for one of its races on one day. */
  'viewer.registrations',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** The colour a kind wears — the dashboard's own status tones. */
export type NotificationTone = 'amber' | 'green' | 'red' | 'blue' | 'violet';

export type AppNotification = {
  /** Stable across reads — `kind:entityId` — so a read mark survives the next poll. */
  id: string;
  kind: NotificationKind;
  /** The headline, e.g. "Payment to validate". */
  title: string;
  /** The sentence under it, naming the order, the runner or the race. */
  body: string;
  /** Where pressing it goes. Always a page this person may open. */
  href: string;
  /** ISO instant the thing happened, which orders the list and decides unread. */
  at: string;
  /** Whether it asks somebody to do something, rather than only telling them. */
  actionable: boolean;
};

export const NOTIFICATION_TONES: Record<NotificationKind, NotificationTone> = {
  'payment.validate': 'amber',
  'registration.paid': 'green',
  'email.unsent': 'red',
  'client.new': 'blue',
  'feedback.new': 'violet',
  'community.pending': 'amber',
  'team.joined': 'green',
  'viewer.registrations': 'green',
};

/** How far back the feed reaches. Older things live on their own screens. */
export const NOTIFICATION_WINDOW_DAYS = 30;

/** The most of one kind a feed carries, so one busy race cannot bury the rest. */
export const NOTIFICATION_KIND_LIMIT = 20;

/** The most the modal lists at once. */
export const NOTIFICATION_LIMIT = 60;

/** How often an open dashboard asks again, while its tab is in view. */
export const NOTIFICATION_POLL_MS = 60_000;

// ── Read state (the browser's) ─────────────────────────────────────────────

export type NotificationReadState = {
  /** ISO instant; anything at or before it counts as seen. Null until "Mark all as read". */
  seenAt: string | null;
  /** Ids opened one by one since the watermark. */
  read: string[];
};

export const EMPTY_READ_STATE: NotificationReadState = { seenAt: null, read: [] };

export function isUnread(item: AppNotification, state: NotificationReadState): boolean {
  if (state.read.includes(item.id)) return false;
  return !state.seenAt || new Date(item.at).getTime() > new Date(state.seenAt).getTime();
}

/** Reads a stored value back, refusing anything that is not the shape written. */
export function asReadState(value: unknown): NotificationReadState {
  if (!value || typeof value !== 'object') return EMPTY_READ_STATE;
  const { seenAt, read } = value as Record<string, unknown>;
  return {
    seenAt: typeof seenAt === 'string' && !Number.isNaN(Date.parse(seenAt)) ? seenAt : null,
    read: Array.isArray(read) ? read.filter((id): id is string => typeof id === 'string').slice(-500) : [],
  };
}

/**
 * Keeps only the read ids the feed still carries — the rest belong to
 * notifications that have gone — so the stored list cannot grow forever.
 */
export function pruneReadState(state: NotificationReadState, items: AppNotification[]): NotificationReadState {
  const live = new Set(items.map(item => item.id));
  const read = state.read.filter(id => live.has(id));
  return read.length === state.read.length ? state : { ...state, read };
}

/** "Just now", "5m", "3h", "2d" — the modal's time column. */
export function formatNotificationAge(at: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
