"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BellOff,
  Building2,
  CheckCheck,
  CircleCheck,
  Flag,
  Landmark,
  MailWarning,
  MessageSquare,
  RotateCw,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import NotificationBell from '@/components/ui/NotificationBell';
import SkeletonSwap, { SkeletonBar } from '@/components/ui/Skeleton';
import LinkPending from '@/components/ui/LinkPending';
import { formatTrailDayHeading, formatTrailInstant, trailDay } from '@/lib/activity';
import {
  EMPTY_READ_STATE,
  NOTIFICATION_POLL_MS,
  NOTIFICATION_TONES,
  NOTIFICATION_WINDOW_DAYS,
  asReadState,
  formatNotificationAge,
  isUnread,
  pruneReadState,
  type AppNotification,
  type NotificationKind,
  type NotificationReadState,
  type NotificationTone,
} from '@/lib/notifications';

/**
 * The bell at the top right of every dashboard page, and the modal it opens.
 *
 * The feed is `GET /api/admin/notifications` (lib/notification-store.ts),
 * which already holds only what this person's permissions open, so nothing
 * here filters by role. It is asked on mount, every `NOTIFICATION_POLL_MS`
 * while the tab is in view, when the tab comes back into view, and each time
 * the modal opens — so the badge moves on its own and the bell swings when
 * something new arrives.
 *
 * **Read state is this browser's** (lib/notifications.ts): a watermark plus
 * the ids opened one by one, in localStorage under the person's id. Every
 * read and write is wrapped, so a private window simply shows everything as
 * unread rather than breaking the bell.
 *
 * **Pressing a notification goes where it is about** — a payment to validate
 * opens that race's registrants searched to the order — marks it read, shows
 * the app's pending marker on the row while the page loads, and folds the
 * modal when the route changes. The modal is a dialog: Esc and the backdrop close it,
 * focus moves into it and back to the bell, and the page behind stops
 * scrolling. From `md` up it opens under the bell; on a phone it is a sheet
 * from the bottom edge, where a thumb reaches it.
 */

const STORAGE_PREFIX = 'rao-notifications:';

type Tab = 'all' | 'unread';

const KIND_ICONS: Record<NotificationKind, React.ComponentType<{ size?: number }>> = {
  'payment.validate': Landmark,
  'registration.paid': CircleCheck,
  'email.unsent': MailWarning,
  'client.new': Building2,
  'feedback.new': MessageSquare,
  'community.pending': Flag,
  'team.joined': UserPlus,
  'viewer.registrations': Users,
};

const TONE_CLASSES: Record<NotificationTone, string> = {
  amber: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
  green: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  red: 'bg-red-400/10 text-red-300 border-red-400/20',
  blue: 'bg-accent-blue/10 text-[#4da3ff] border-accent-blue/25',
  violet: 'bg-violet-400/10 text-violet-300 border-violet-400/20',
};

function readStored(key: string | null): NotificationReadState {
  if (!key) return EMPTY_READ_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? asReadState(JSON.parse(raw)) : EMPTY_READ_STATE;
  } catch {
    return EMPTY_READ_STATE;
  }
}

function writeStored(key: string | null, state: NotificationReadState) {
  if (!key) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch {
    // Storage refused (private window, full, blocked): the marks last this visit.
  }
}

export default function NotificationsCenter() {
  const pathname = usePathname();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [readState, setReadState] = useState<NotificationReadState>(EMPTY_READ_STATE);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Like the phone menu (DashboardShell), the modal remembers the page it
  // was opened on, so any route change — a notification pressed, the
  // browser's back button — folds it with no effect racing the navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const isOpen = openOn === pathname;
  const [isShown, setIsShown] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [tab, setTab] = useState<Tab>('all');

  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const keyRef = useRef<string | null>(null);
  const titleId = useId();
  const tabsId = useId();

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch('/api/admin/notifications', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { items: AppNotification[]; viewerKey: string; now: string };
      setItems(data.items);
      setNow(new Date(data.now));
      // The first answer says whose marks to read; a different person in
      // this browser (a sign-out and back in) reads their own.
      const key = data.viewerKey;
      const stored = keyRef.current === key ? null : readStored(key);
      keyRef.current = key;
      setViewerKey(key);
      // Drop read marks for notifications that have gone, so storage stays small.
      setReadState(current => {
        const pruned = pruneReadState(stored ?? current, data.items);
        if (pruned !== (stored ?? current)) writeStored(key, pruned);
        return pruned;
      });
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setLoaded(true);
    }
  }, []);

  // On mount, on a timer while the tab is in view, and on coming back to it.
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = window.setInterval(tick, NOTIFICATION_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  const updateReadState = useCallback(
    (next: (current: NotificationReadState) => NotificationReadState) => {
      setReadState(current => {
        const value = next(current);
        writeStored(viewerKey, value);
        return value;
      });
    },
    [viewerKey],
  );

  const unreadCount = useMemo(
    () => items.filter(item => isUnread(item, readState)).length,
    [items, readState],
  );

  const visible = useMemo(
    () => (tab === 'unread' ? items.filter(item => isUnread(item, readState)) : items),
    [items, readState, tab],
  );

  // Manila day headings, in feed order.
  const groups = useMemo(() => {
    const byDay: { day: string; items: AppNotification[] }[] = [];
    for (const item of visible) {
      const day = trailDay(item.at);
      const last = byDay[byDay.length - 1];
      if (last && last.day === day) last.items.push(item);
      else byDay.push({ day, items: [item] });
    }
    return byDay;
  }, [visible]);

  // ── Open / close ─────────────────────────────────────────────────────────

  const open = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setIsClosing(false);
    setOpenOn(pathname);
    setNow(new Date());
    void refresh();
  };

  const close = useCallback(() => {
    setIsClosing(true);
    setIsShown(false);
    closeTimer.current = window.setTimeout(() => {
      setOpenOn(null);
      setIsClosing(false);
      bellRef.current?.focus();
    }, 150);
  }, []);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  // A frame after mounting, so the panel transitions in rather than appearing.
  useEffect(() => {
    if (!isOpen || isClosing) return;
    const frame = window.requestAnimationFrame(() => {
      setIsShown(true);
      panelRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, isClosing]);

  // While open: Esc closes, the page stops scrolling, Tab stays inside.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex="0"]',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close]);

  const markAllRead = () => {
    const latest = items.reduce((max, item) => (item.at > max ? item.at : max), now.toISOString());
    updateReadState(() => ({ seenAt: latest, read: [] }));
  };

  const openItem = useCallback(
    (item: AppNotification) => {
      updateReadState(current =>
        isUnread(item, current) ? { ...current, read: [...current.read, item.id] } : current,
      );
      // A notification for another page leaves the modal open, its row's
      // pending marker in view, until the route change folds it — a race's
      // registrants can take seconds to load, and a modal that vanished at
      // once left the old page on screen with no sign the press was heard.
      // One for the page already on screen changes no route, so it folds here.
      if (new URL(item.href, window.location.origin).pathname === pathname) close();
    },
    [updateReadState, close, pathname],
  );

  const retry = () => {
    setRetrying(true);
    void refresh().finally(() => setRetrying(false));
  };

  return (
    <>
      <NotificationBell
        ref={bellRef}
        count={unreadCount}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
      />

      {/* Portalled: the bell's slot is its own stacking context under the
          sidebar, and the dialog has to cover both. */}
      {isOpen && createPortal(
        <div
          className={`notif-overlay ${isShown ? 'is-open' : ''}`}
          onMouseDown={event => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`t-modal notif-panel ${isShown ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
          >
            <div className="notif-head">
              <div className="min-w-0">
                <h2 id={titleId} className="m-0 text-lg font-semibold text-white">
                  Notifications
                </h2>
                <p className="m-0 mt-0.5 text-sm text-secondary">
                  {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
                </p>
              </div>
              <button type="button" onClick={close} className="notif-icon-btn" aria-label="Close notifications">
                <X size={20} />
              </button>
            </div>

            <div className="notif-toolbar">
              <NotificationTabs id={tabsId} tab={tab} unread={unreadCount} onChange={setTab} />
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="btn-filter notif-mark-all"
              >
                <CheckCheck size={16} aria-hidden="true" />
                <span>Mark all as read</span>
              </button>
            </div>

            <div
              className="notif-body"
              role="tabpanel"
              id={`${tabsId}-panel`}
              aria-labelledby={`${tabsId}-tab-${tab}`}
            >
              <SkeletonSwap loading={!loaded} skeleton={<NotificationsSkeleton />}>
                {failed && items.length === 0 ? (
                  <div className="notif-empty">
                    <p className="m-0 text-sm text-secondary">The notifications could not be loaded.</p>
                    <button type="button" onClick={retry} className="btn-filter" disabled={retrying}>
                      <RotateCw size={16} aria-hidden="true" className={retrying ? 'animate-spin' : ''} />
                      <span>Try Again</span>
                    </button>
                  </div>
                ) : groups.length === 0 ? (
                  <div className="notif-empty">
                    <span className="notif-empty-icon" aria-hidden="true">
                      <BellOff size={22} />
                    </span>
                    <p className="m-0 font-medium text-white">
                      {tab === 'unread' ? 'No unread notifications' : 'Nothing new yet'}
                    </p>
                    <p className="m-0 text-sm text-secondary">
                      {tab === 'unread'
                        ? 'Everything here has been read.'
                        : 'Payments to validate, new registrations and anything else for you will show up here.'}
                    </p>
                  </div>
                ) : (
                  groups.map(group => (
                    <section key={group.day} aria-label={formatTrailDayHeading(group.day, now)}>
                      <h3 className="notif-day">{formatTrailDayHeading(group.day, now)}</h3>
                      <ul className="m-0 p-0 list-none">
                        {group.items.map(item => (
                          <NotificationRow
                            key={item.id}
                            item={item}
                            unread={isUnread(item, readState)}
                            now={now}
                            onOpen={openItem}
                          />
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </SkeletonSwap>
            </div>

            <p className="notif-foot">Showing the last {NOTIFICATION_WINDOW_DAYS} days.</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function NotificationRow({
  item,
  unread,
  now,
  onOpen,
}: {
  item: AppNotification;
  unread: boolean;
  now: Date;
  onOpen: (item: AppNotification) => void;
}) {
  const Icon = KIND_ICONS[item.kind];
  return (
    <li>
      <Link href={item.href} onClick={() => onOpen(item)} className={`notif-row ${unread ? 'is-unread' : ''}`}>
        <span className={`notif-kind ${TONE_CLASSES[NOTIFICATION_TONES[item.kind]]}`} aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="notif-text">
          <span className="notif-title">
            {item.title}
            {item.actionable && <span className="notif-action-chip">Needs action</span>}
          </span>
          <span className="notif-sentence">{item.body}</span>
        </span>
        <span className="notif-meta">
          <time dateTime={item.at} title={formatTrailInstant(item.at)} className="notif-age">
            {formatNotificationAge(item.at, now)}
          </time>
          <LinkPending />
          {unread && (
            <span className="notif-dot">
              <span className="sr-only">Unread</span>
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/** All / Unread — the team screen's sliding tabs (`.t-tabs`), two of them. */
function NotificationTabs({
  id,
  tab,
  unread,
  onChange,
}: {
  id: string;
  tab: Tab;
  unread: number;
  onChange: (tab: Tab) => void;
}) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const placed = useRef(false);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const button = tabRefs.current.get(tab);
    if (!pill || !button) return;
    if (!placed.current) pill.style.transition = 'none';
    pill.style.transform = `translateX(${button.offsetLeft - 3}px)`;
    pill.style.width = `${button.offsetWidth}px`;
    if (!placed.current) {
      void pill.offsetWidth;
      pill.style.transition = '';
      placed.current = true;
    }
  }, [tab, unread]);

  const options: { value: Tab; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: unread > 0 ? `Unread (${unread})` : 'Unread' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Show"
      className="t-tabs notif-tabs"
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next: Tab = tab === 'all' ? 'unread' : 'all';
        onChange(next);
        tabRefs.current.get(next)?.focus();
      }}
    >
      <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
      {options.map(option => (
        <button
          key={option.value}
          ref={element => {
            if (element) tabRefs.current.set(option.value, element);
            else tabRefs.current.delete(option.value);
          }}
          id={`${id}-tab-${option.value}`}
          type="button"
          role="tab"
          aria-selected={tab === option.value}
          aria-controls={`${id}-panel`}
          tabIndex={tab === option.value ? 0 : -1}
          className="t-tab"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The wait draws the rows it is waiting for: an icon, two lines, a time. */
function NotificationsSkeleton() {
  return (
    <>
      <SkeletonBar className="h-3 w-24 mx-5 mt-4 mb-2" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-3">
          <SkeletonBar className="h-10 w-10 rounded-xl shrink-0" />
          <div className="flex-1 flex flex-col gap-2 pt-1">
            <SkeletonBar className="h-3.5 w-2/5" />
            <SkeletonBar className="h-3 w-11/12" />
          </div>
          <SkeletonBar className="h-3 w-8 mt-1" />
        </div>
      ))}
    </>
  );
}
