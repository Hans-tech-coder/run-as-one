"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ExternalLink, Search } from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import LinkPending from '@/components/ui/LinkPending';
import { rememberSidebar } from './dashboard-sidebar';
import type { DashboardTheme } from './dashboard-theme';
import DashboardQuickJump, { useModifierLabel, type QuickJumpTarget } from './DashboardQuickJump';
import './Admin.css';

/**
 * The dashboard's frame: the sidebar menu and the header's tools. It was pulled out
 * of two near-copies, `AdminShell` and the super admin's `SuperAdminShell`,
 * whose fixes kept having to be remembered twice. The super admin's shell is
 * gone since the dashboards merged (ADMIN_MERGE_PLAN.md, Batch 2); `AdminShell`
 * hands over only which links a person is offered and how their role reads.
 *
 * **The menu** is full-width rows under a MENU label: the pages and nothing
 * else. The page on screen is a tinted band with a bar on its right edge. The
 * person, Settings and Log Out used to sit at its foot; the owner moved them to
 * the header, beside the bell (`AccountMenu`).
 *
 * **The rows are grouped** (DASHBOARD_SHELL_PLAN.md, Batch 1). Nine of them
 * under one label read as a list to be searched rather than a place to be in,
 * so `AdminShell` hands them over already sorted into Races, Platform and
 * Organization, with Dashboard standing alone above. A hairline always divides
 * them; **the words only appear when two or more labelled groups survive the
 * role filter**, because a label that has nothing to distinguish it from is
 * just another row of chrome — a validator holding Dashboard and Events sees
 * none, and neither does a client viewer, whose menu is Dashboard alone.
 *
 * **A row stays lit for everything under it.** `isActivePath` matches on the
 * path's prefix, not on equality: `/admin/events/12/registrants` is still
 * Events. Equality left the seven deepest pages in the dashboard — every screen
 * inside an event — with no row lit at all, which is where the menu was needed
 * most. `/admin` is matched exactly, or it would own every page in the app.
 *
 * **It is the same menu at every width**, the owner's decision: a phone does
 * not get a top bar and a drawer of its own. The round chevron on the edge
 * folds it to an icon rail and back — and that is the only thing that does.
 * A `[` shortcut was added here and taken out again at the owner's word: they
 * did not want the key advertised in the chevron's tooltip, and a fold that
 * answers to a keystroke nobody is told about is a surprise, not a feature.
 * Every icon keeps its place, so only the edge moves; the labels fade but stay
 * each row's accessible name.
 * - **From `md` up** the menu pushes the page, and collapsing is a preference:
 *   it is kept in a cookie the layout reads (`dashboard-sidebar.ts`), so the
 *   rail is drawn at the right width on the server's first paint, and a
 *   tooltip names each icon on hover and keyboard focus.
 * - **Below `md`** it rests as a narrower rail and opens out *over* the page,
 *   because pushing a phone's content aside would leave it a sliver. Open is a
 *   moment, not a preference: the body stops scrolling, `<main>` is `inert`,
 *   and a route change, Esc or a tap on the backdrop folds it back. The cookie
 *   is never read there, so a phone always arrives on the rail.
 *
 * Which of the two applies is decided in `Admin.css` from the viewport, so the
 * server's markup is right for both and nothing flashes while it hydrates. The
 * width is read in script only to word the chevron's label, to decide what a
 * press of it means, and to know whether the rail wants tooltips.
 *
 * **The rail's tooltip is one element for the whole menu.** It used to be a
 * copy inside every row, which meant the menu had to be given
 * `overflow: visible` while collapsed so the tips could reach past the rail —
 * and that took the menu's scrollbar with it, so on a short or zoomed viewport
 * the last rows could not be reached at all. Positioned `fixed` from the shell
 * instead, it escapes nothing: the menu scrolls at every width.
 *
 * Three things about it are the result of it looking wrong in use:
 * - **It is driven by one delegated handler** (`trackTip`), not by handlers on
 *   each row. See its own comment: per-row `mouseenter` / `mouseleave` tore the
 *   element down between every pair of icons, so the rail flickered.
 * - **Its left edge is measured from the rail, not from the row**, so the rows,
 *   the search and the chevron all line their tooltips up in one column.
 * - **A shortcut in a tooltip is drawn as a key**, through `data-tip-key`, and
 *   never written into the sentence — "Expand menu [" read as a typo, which is
 *   what got the `[` shortcut removed altogether. Only the search row carries
 *   a key now, and it is the ⌘K the owner asked for.
 *
 * Each thing that wants one carries `data-tip`, optionally `data-tip-key` and
 * `data-tip-gap`. Nothing else is needed to opt a new row in.
 */

export type DashboardNavItem = {
  name: string;
  path: string;
  icon: React.ReactNode;
};

/** A run of rows under one heading. `label: null` is the ungrouped top of the menu. */
export type DashboardNavGroup = {
  label: string | null;
  items: DashboardNavItem[];
};

const MENU_ID = 'dashboard-menu';
const MAIN_ID = 'dash-main';

/** Tailwind's `md`, written as the CSS switch writes it. From here up the menu pushes the page. */
const WIDE_QUERY = '(width >= 48rem)';

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const isWideNow = () => window.matchMedia(WIDE_QUERY).matches;

/** The server cannot know; the label settles on the client's first render. */
const isWideOnServer = () => true;

/**
 * Is this the row for the page on screen? Everything under a section belongs to
 * it — `/admin/events/new` and `/admin/events/12/results` are both Events — but
 * `/admin` is the dashboard's own page, not its root, so it is matched exactly.
 */
export function isActivePath(pathname: string, path: string) {
  if (path === '/admin') return pathname === '/admin';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Where the rail's tooltip is drawn, what it says, and the key that does it. */
type RailTip = { text: string; hint?: string; top: number; left: number };

export default function DashboardShell({
  navGroups,
  initialCollapsed = false,
  theme = 'dark',
  headerAccessory,
  quickJumpExtras = [],
  children,
}: {
  navGroups: DashboardNavGroup[];
  /** Read from the sidebar cookie by the layout, so the desktop's first paint is already right. */
  initialCollapsed?: boolean;
  /**
   * The account menu's Dark Mode choice (dashboard-theme.ts). It is drawn on
   * the frame from the server's first paint, and mirrored onto `<html>` once
   * mounted so what portals to `<body>` — row menus, lightboxes, the
   * notifications modal — and the themed favicon follow it too. The mirror is
   * removed on the way out, so the public site never inherits the choice.
   */
  theme?: DashboardTheme;
  /**
   * What sits at the right end of every page's header — the notification
   * bell and the account menu. Drawn once here rather than in each page's
   * `.admin-header`, and kept clear of the header's own actions by the
   * padding `Admin.css` gives every header beside it
   * (`.dash-header-accessory`), sized from `--dash-accessory-w`.
   */
  headerAccessory?: React.ReactNode;
  /**
   * Destinations the quick jump should reach that are not rows in the menu —
   * the settings pages, which live in the account menu instead.
   */
  quickJumpExtras?: QuickJumpTarget[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isWide = useSyncExternalStore(subscribeToWidth, isWideNow, isWideOnServer);
  const modKey = useModifierLabel();

  // The desktop's remembered choice.
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // A phone's open menu remembers the page it was opened on rather than
  // holding a plain boolean, so any change of route folds it back — a row, the
  // browser's back button, a router.push from inside a page — with no effect
  // racing the navigation to reset it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const isOpen = openOn === pathname;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const jumpRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const hasAccessory = Boolean(headerAccessory);
  const toolsRef = useRef<HTMLDivElement>(null);

  // The header keeps its right edge clear by the tools' real width: a long
  // name widens the account trigger, and a phone hides its words. Until this
  // runs, `Admin.css` reserves the widest the tools can be at each width, so
  // the first paint may leave extra room but never overlaps.
  useEffect(() => {
    const tools = toolsRef.current;
    const main = mainRef.current;
    if (!tools || !main) return;
    const observer = new ResizeObserver(() => {
      main.style.setProperty('--dash-accessory-w', `${Math.ceil(tools.offsetWidth)}px`);
    });
    observer.observe(tools);
    return () => {
      observer.disconnect();
      main.style.removeProperty('--dash-accessory-w');
    };
  }, [hasAccessory]);

  const close = useCallback(() => setOpenOn(null), []);

  const expanded = isWide ? !collapsed : isOpen;

  // Only the desktop's rail wants tooltips: below `md` the rail is a touch
  // target, where nothing hovers and a tip would never be dismissed.
  const railTips = isWide && collapsed;
  const [tip, setTip] = useState<RailTip | null>(null);

  const hideTip = useCallback(() => setTip(null), []);

  /**
   * One handler on the whole menu rather than a set on every row. `mouseover`
   * and `focusin` bubble, where `mouseenter` does not, and that is the whole
   * point: sweeping the rail updates the tooltip already on screen instead of
   * unmounting one and mounting the next. Per-row handlers fired the leaving
   * row's `mouseleave` *before* the arriving row's `mouseenter`, so the element
   * was destroyed and rebuilt between every pair of icons — replaying the open
   * delay and the fade each time, which is what made the rail flicker.
   */
  const trackTip = (event: React.SyntheticEvent<HTMLElement>) => {
    if (!railTips || !sidebarRef.current) return;
    const row = (event.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (!row) {
      setTip(null);
      return;
    }
    const rect = row.getBoundingClientRect();
    // The left edge comes from the rail, not from the row, so every tooltip
    // lines up in one column. The chevron's 44px button hangs out over the
    // page by 22px and would otherwise throw its own tooltip further right
    // than all the others — which is exactly how it looked.
    const railRight = sidebarRef.current.getBoundingClientRect().right;
    const next: RailTip = {
      text: row.dataset.tip ?? '',
      hint: row.dataset.tipKey || undefined,
      top: rect.top + rect.height / 2,
      left: railRight + Number(row.dataset.tipGap ?? 12),
    };
    // `mouseover` fires again crossing from a row's icon to its label, which is
    // the same row and the same tooltip; handing back the object React already
    // holds lets it skip the render entirely.
    setTip(current =>
      current &&
      current.text === next.text &&
      current.hint === next.hint &&
      current.top === next.top &&
      current.left === next.left
        ? current
        : next,
    );
  };

  // A tooltip is placed once, from a rect read at the moment of the hover. A
  // menu that scrolls under it, or a window that resizes, would leave it
  // pointing at a row that has moved, so it is dropped rather than left lying.
  useEffect(() => {
    if (!railTips) return;
    const drop = () => setTip(null);
    window.addEventListener('scroll', drop, true);
    window.addEventListener('resize', drop);
    return () => {
      window.removeEventListener('scroll', drop, true);
      window.removeEventListener('resize', drop);
    };
  }, [railTips]);

  const toggleMenu = useCallback(() => {
    if (isWide) {
      setCollapsed(current => {
        const next = !current;
        rememberSidebar(next);
        return next;
      });
    } else {
      setOpenOn(current => (current === pathname ? null : pathname));
    }
  }, [isWide, pathname]);

  useEffect(() => {
    if (!isOpen) {
      // Only after a real close: on first render there is nothing to return from.
      if (wasOpen.current) {
        wasOpen.current = false;
        toggleRef.current?.focus();
      }
      return;
    }

    wasOpen.current = true;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    // Turning a tablet sideways past `md` puts the menu beside the page; one
    // left "open" over it would keep the page locked and inert.
    const wide = window.matchMedia(WIDE_QUERY);
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches) close();
    };

    document.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
    };
  }, [isOpen, close]);

  // ── Quick jump ─────────────────────────────────────────────────────────
  // Three states rather than a boolean, so `.t-modal` can play its close
  // before the dialog leaves the tree (the same contract AlertModal has).
  const [jump, setJump] = useState<'closed' | 'open' | 'closing'>('closed');

  const closeJump = useCallback(() => {
    setJump(current => (current === 'open' ? 'closing' : current));
  }, []);

  useEffect(() => {
    if (jump !== 'closing') return;
    const ms =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--modal-close-dur'),
      ) || 150;
    const timer = setTimeout(() => {
      setJump('closed');
      jumpRef.current?.focus();
    }, ms);
    return () => clearTimeout(timer);
  }, [jump]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setJump(current => (current === 'open' ? 'closing' : 'open'));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const jumpTargets = useMemo<QuickJumpTarget[]>(() => {
    const fromMenu = navGroups.flatMap(group =>
      group.items.map(item => ({
        label: item.name,
        href: item.path,
        group: group.label ?? 'Dashboard',
        icon: item.icon,
      })),
    );
    return [...fromMenu, ...quickJumpExtras];
  }, [navGroups, quickJumpExtras]);

  // ── The menu ───────────────────────────────────────────────────────────
  const groups = navGroups.filter(group => group.items.length > 0);
  // A heading is worth its row only when there is another heading to tell it
  // apart from. One labelled group means the label is saying nothing.
  const showGroupLabels = groups.filter(group => group.label).length >= 2;

  const renderLink = (item: DashboardNavItem) => {
    const active = isActivePath(pathname, item.path);
    return (
      <Link
        key={item.path}
        href={item.path}
        className={`admin-nav-item ${active ? 'active' : ''}`}
        aria-current={active ? 'page' : undefined}
        data-tip={item.name}
        // A row for another page leaves an open menu open, so its pending
        // marker stays in view until the route change folds it. A tap on the
        // page already showing changes no route, so it folds here.
        onClick={() => {
          if (active) close();
          hideTip();
        }}
      >
        <span className="admin-nav-icon" aria-hidden="true">{item.icon}</span>
        <span className="admin-nav-label">{item.name}</span>
        <LinkPending />
      </Link>
    );
  };

  return (
    <div className="admin-layout" data-theme={theme}>
      {/* The keyboard's way past the menu. First in the DOM, so it is the
          first thing Tab reaches on any dashboard page; invisible until it
          has focus (Admin.css). */}
      <a href={`#${MAIN_ID}`} className="dash-skip-link">
        Skip to content
      </a>

      {/* A phone's open menu lies over the page; this is the thumb's way out.
          Not in the tab order: Esc and the chevron are the keyboard's. */}
      <button
        type="button"
        className={`dash-backdrop ${isOpen ? 'is-open' : ''}`}
        tabIndex={-1}
        aria-label="Collapse menu"
        onClick={close}
      />

      <aside
        ref={sidebarRef}
        id={MENU_ID}
        className={`admin-sidebar ${isOpen ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}
        onMouseOver={trackTip}
        onMouseLeave={hideTip}
        onFocus={trackTip}
        onBlur={hideTip}
      >
        {/* The mark is the way back to the Overview — it was decoration until
            Batch 1, which is the one thing a logo in a dashboard is for. */}
        <Link href="/admin" className="admin-brand" aria-label="Run As One dashboard home">
          <RunAsOneLogo />
        </Link>

        <button
          ref={jumpRef}
          type="button"
          className="dash-jump-trigger"
          aria-haspopup="dialog"
          aria-label="Jump to a page"
          data-tip="Jump to a page"
          data-tip-key={`${modKey}K`}
          onClick={() => setJump('open')}
        >
          <span className="admin-nav-icon" aria-hidden="true"><Search size={20} /></span>
          <span className="admin-nav-label">Jump to…</span>
          <kbd className="dash-jump-hint" aria-hidden="true">{modKey}K</kbd>
        </button>

        <div className="admin-menu-head">
          <span className="admin-menu-label">Menu</span>
          <button
            ref={toggleRef}
            type="button"
            className="admin-collapse-toggle"
            aria-label={expanded ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={expanded}
            aria-controls={MENU_ID}
            data-tip={expanded ? 'Collapse menu' : 'Expand menu'}
            // Its knob hangs 12px out past the rail, so its tooltip needs the
            // wider gap to clear it rather than sit against it.
            data-tip-gap="28"
            onClick={toggleMenu}
          >
            <span className="admin-collapse-knob" aria-hidden="true">
              <ChevronLeft size={14} strokeWidth={2.75} />
            </span>
          </button>
        </div>

        <nav className="admin-nav" aria-label="Dashboard">
          {groups.map((group, index) => (
            <div
              key={group.label ?? `group-${index}`}
              className={`admin-nav-group ${index > 0 ? 'has-rule' : ''}`}
              aria-label={showGroupLabels ? group.label ?? undefined : undefined}
              role={showGroupLabels && group.label ? 'group' : undefined}
            >
              {showGroupLabels && group.label && (
                <span className="admin-nav-group-label" aria-hidden="true">{group.label}</span>
              )}
              {group.items.map(renderLink)}
            </div>
          ))}
        </nav>

        {/* Staff check the live site all day; before this the only way out of
            the dashboard was the browser's address bar. */}
        <div className="admin-sidebar-foot">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-nav-item"
            data-tip="View public site"
          >
            <span className="admin-nav-icon" aria-hidden="true"><ExternalLink size={20} /></span>
            <span className="admin-nav-label">View public site</span>
          </a>
        </div>
      </aside>

      <main
        id={MAIN_ID}
        ref={mainRef}
        tabIndex={-1}
        className={`admin-main ${headerAccessory ? 'has-header-accessory' : ''}`}
        inert={isOpen}
      >
        {headerAccessory && (
          <div className="dash-header-accessory">
            <div ref={toolsRef} className="dash-header-tools">{headerAccessory}</div>
          </div>
        )}
        {children}
      </main>

      {/* The rail's tooltip: one element for the whole menu, placed from the
          row it belongs to. Silent — every row it names already carries that
          name as its own accessible label. `railTips` is read here as well as
          in `trackTip`, so a rail that stops being a rail — unfolded, or a
          tablet turned past `md` — drops its last tip on the same render
          rather than leaving it stranded over the page.

          **It must stay after `<main>`.** It sat between the sidebar and the
          page at first, which broke `.admin-sidebar.is-collapsed + .admin-main`
          every time it appeared: the page lost the rule narrowing it to the
          80px rail and sprang back to the full 280px margin, so the whole
          screen jumped 200px on every hover and back again on the way out.
          Those selectors are `~` now so this cannot recur, but a `fixed`
          element still has no business between the two. */}
      {railTips && tip && (
        <span
          className="dash-rail-tip"
          aria-hidden="true"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.text}
          {tip.hint && <kbd className="dash-rail-tip-key">{tip.hint}</kbd>}
        </span>
      )}

      {jump !== 'closed' && (
        <DashboardQuickJump
          open={jump === 'open'}
          closing={jump === 'closing'}
          targets={jumpTargets}
          onClose={closeJump}
        />
      )}
    </div>
  );
}
