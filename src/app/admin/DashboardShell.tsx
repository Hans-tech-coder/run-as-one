"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, LogOut } from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import LinkPending from '@/components/ui/LinkPending';
import { rememberSidebar } from './dashboard-sidebar';
import './Admin.css';

/**
 * The dashboard's frame: the sidebar menu and the user block. It was pulled out
 * of two near-copies, `AdminShell` and the super admin's `SuperAdminShell`,
 * whose fixes kept having to be remembered twice. The super admin's shell is
 * gone since the dashboards merged (ADMIN_MERGE_PLAN.md, Batch 2); `AdminShell`
 * hands over only which links a person is offered and how their role reads.
 *
 * **The menu** is one column of full-width rows under a MENU label: the pages,
 * a divider, then the account rows (Settings, Log Out), with the person at the
 * foot. The page on screen is a tinted band with a bar on its right edge.
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

export type DashboardUserBlock = {
  name: string;
  initial: string;
  /** The line under the name — "Super Admin", "Staff · RUN AS ONE", "Client Viewer · …". */
  roleLine: string;
  avatarStyle?: React.CSSProperties;
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
  secondaryNavItems = [],
  userBlock,
  onLogout,
  initialCollapsed = false,
  children,
}: {
  /** The pages, above the divider. */
  navItems: DashboardNavItem[];
  /** Below the divider, before Log Out — the account's own screens. */
  secondaryNavItems?: DashboardNavItem[];
  userBlock: DashboardUserBlock;
  onLogout: () => void;
  /** Read from the sidebar cookie by the layout, so the desktop's first paint is already right. */
  initialCollapsed?: boolean;
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

  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

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
    <div className="admin-layout">
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

          <div className="admin-nav-divider" aria-hidden="true" />

          <div className="admin-nav-group">
            {secondaryNavItems.map(renderLink)}
            <button type="button" className="admin-nav-item admin-nav-logout" onClick={onLogout}>
              <span className="admin-nav-icon" aria-hidden="true"><LogOut size={20} /></span>
              <span className="admin-nav-label">Log Out</span>
              <span className="admin-nav-tip" aria-hidden="true">Log Out</span>
            </button>
          </div>
        </nav>

        <div className="admin-user">
          <div className="admin-user-avatar" style={userBlock.avatarStyle} aria-hidden="true">
            {userBlock.initial}
          </div>
          <div className="admin-user-info">
            <div className="admin-user-name">{userBlock.name}</div>
            <div className="admin-user-role" title={userBlock.roleLine}>{userBlock.roleLine}</div>
          </div>
          <span className="admin-nav-tip" aria-hidden="true">
            <span className="admin-nav-tip-title">{userBlock.name}</span>
            <span className="admin-nav-tip-sub">{userBlock.roleLine}</span>
          </span>
        </div>
      </aside>

      <main className="admin-main" inert={isOpen}>
        {children}
      </main>
    </div>
  );
}
