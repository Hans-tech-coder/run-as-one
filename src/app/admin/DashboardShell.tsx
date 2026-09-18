"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import LinkPending from '@/components/ui/LinkPending';
import { rememberSidebar } from './dashboard-sidebar';
import type { DashboardTheme } from './dashboard-theme';
import './Admin.css';

/**
 * The dashboard's frame: the sidebar menu and the header's tools. It was pulled out
 * of two near-copies, `AdminShell` and the super admin's `SuperAdminShell`,
 * whose fixes kept having to be remembered twice. The super admin's shell is
 * gone since the dashboards merged (ADMIN_MERGE_PLAN.md, Batch 2); `AdminShell`
 * hands over only which links a person is offered and how their role reads.
 *
 * **The menu** is one column of full-width rows under a MENU label: the pages
 * and nothing else. The page on screen is a tinted band with a bar on its
 * right edge. The person, Settings and Log Out used to sit at its foot; the
 * owner moved them to the header, beside the bell (`AccountMenu`).
 *
 * **It is the same menu at every width**, the owner's decision: a phone does
 * not get a top bar and a drawer of its own. The round chevron on the edge
 * folds it to an icon rail and back. Every icon keeps its place, so only the
 * edge moves; the labels fade but stay each row's accessible name.
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
 * width is read in script only to word the chevron's label and to decide what
 * a press of it means.
 */

export type DashboardNavItem = {
  name: string;
  path: string;
  icon: React.ReactNode;
};

const MENU_ID = 'dashboard-menu';

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

export default function DashboardShell({
  navItems,
  initialCollapsed = false,
  theme = 'dark',
  headerAccessory,
  children,
}: {
  navItems: DashboardNavItem[];
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
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isWide = useSyncExternalStore(subscribeToWidth, isWideNow, isWideOnServer);

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

  const toggleMenu = () => {
    if (isWide) {
      const next = !collapsed;
      setCollapsed(next);
      rememberSidebar(next);
    } else if (isOpen) {
      close();
    } else {
      setOpenOn(pathname);
    }
  };

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

  const renderLink = (item: DashboardNavItem) => {
    const active = pathname === item.path;
    return (
      <Link
        key={item.path}
        href={item.path}
        className={`admin-nav-item ${active ? 'active' : ''}`}
        aria-current={active ? 'page' : undefined}
        // A row for another page leaves an open menu open, so its pending
        // marker stays in view until the route change folds it. A tap on the
        // page already showing changes no route, so it folds here.
        onClick={() => {
          if (active) close();
        }}
      >
        <span className="admin-nav-icon" aria-hidden="true">{item.icon}</span>
        <span className="admin-nav-label">{item.name}</span>
        <LinkPending />
        {/* The desktop rail's tooltip. The label beside it is still the
            link's name, so this copy stays silent. */}
        <span className="admin-nav-tip" aria-hidden="true">{item.name}</span>
      </Link>
    );
  };

  return (
    <div className="admin-layout" data-theme={theme}>
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
        id={MENU_ID}
        className={`admin-sidebar ${isOpen ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      >
        <div className="admin-brand">
          <RunAsOneLogo />
        </div>

        <div className="admin-menu-head">
          <span className="admin-menu-label">Menu</span>
          <button
            ref={toggleRef}
            type="button"
            className="admin-collapse-toggle"
            aria-label={expanded ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={expanded}
            aria-controls={MENU_ID}
            onClick={toggleMenu}
          >
            <span className="admin-collapse-knob" aria-hidden="true">
              <ChevronLeft size={14} strokeWidth={2.75} />
            </span>
          </button>
        </div>

        <nav className="admin-nav" aria-label="Dashboard">
          <div className="admin-nav-group">{navItems.map(renderLink)}</div>
        </nav>
      </aside>

      <main
        ref={mainRef}
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
    </div>
  );
}
