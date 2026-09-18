"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Globe, IdCard, LogOut, Moon, ShieldCheck, Sun, UserRound, type LucideIcon } from 'lucide-react';
import LinkPending from '@/components/ui/LinkPending';
import BusyLabel from '@/components/ui/BusyLabel';
import type { SettingsSection, SettingsSectionKey } from './settings/sections';
import type { DashboardTheme } from './dashboard-theme';
import { cssDurationMs } from '@/lib/css-duration';

/**
 * The signed-in person, beside the notification bell: avatar, name and role
 * line, and a chevron that opens the account's menu — the settings pages
 * (Profile, Security, Site Settings for `platform:manage`, Your Access; see
 * `settings/sections.ts`), the Dark Mode switch, and Log Out.
 *
 * Dark Mode sits after the pages and before Log Out, in a group of its own:
 * the rows above it go somewhere, this one changes the screen in place, and
 * Log Out stays last where it always is. The whole row is the switch
 * (`role="switch"`), so the 44px row is the target rather than the small
 * track, and pressing it leaves the menu open so the change can be seen
 * landing. The track is transitions.dev's toggle (27), on `.t-toggle`.
 * The row says which theme is on: a moon and "Dark Mode", or a sun and
 * "Light Mode". The icons cross over with the icon swap (09, `.t-icon-swap`)
 * and the words with the text swap (04, `.t-text-swap`: out upward, then in
 * from below). Its accessible name stays "Dark Mode" whatever it shows, since
 * a switch's name is the thing it turns on and `aria-checked` says whether.
 *
 * It used to be the sidebar's foot, with Settings and Log Out as rows above
 * it. The owner moved all three here, to the top right where a dashboard's
 * account usually lives, so the sidebar is the pages and nothing else.
 *
 * The menu is the row menus' dropdown (`.action-dropdown-menu`, transitions.dev's
 * `.t-dropdown`), hung from the trigger's right edge. It is a disclosure, not
 * an ARIA menu: ordinary controls in tab order. Esc and a press outside
 * fold it, and like the notifications modal it remembers the page it was
 * opened on, so pressing a settings row folds it once the route changes, with the
 * row's pending marker showing until then. From `lg` down the trigger is the
 * avatar and chevron alone, so the menu opens with the name and role line the
 * trigger no longer has room for.
 */

export type AccountMenuUser = {
  name: string;
  initial: string;
  /** "Super Admin", "Staff · RUN AS ONE", "Client Viewer · …". */
  roleLine: string;
  /** The profile photo set in Settings; without one the initial is drawn. */
  avatarUrl?: string | null;
  avatarStyle?: React.CSSProperties;
};

const SECTION_ICONS: Record<SettingsSectionKey, LucideIcon> = {
  profile: UserRound,
  security: ShieldCheck,
  site: Globe,
  access: IdCard,
};

/** The round avatar: the person's photo when they have set one, else their initial. */
function Avatar({ user }: { user: AccountMenuUser }) {
  return (
    <span className="account-avatar" style={user.avatarStyle} aria-hidden="true">
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" width={36} height={36} />
      ) : (
        user.initial
      )}
    </span>
  );
}

export default function AccountMenu({
  user,
  settingsSections,
  theme,
  onThemeChange,
  onLogout,
}: {
  user: AccountMenuUser;
  /** The settings pages this person may open, in menu order. */
  settingsSections: SettingsSection[];
  theme: DashboardTheme;
  onThemeChange: (theme: DashboardTheme) => void;
  onLogout: () => Promise<void> | void;
}) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const isOpen = openOn === pathname;
  const [isShown, setIsShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Set on the first press, so the switch does not play its "off" bounce as the menu opens.
  const [switchTouched, setSwitchTouched] = useState(false);
  const isDark = theme === 'dark';
  const themeLabel = (dark: boolean) => (dark ? 'Dark Mode' : 'Light Mode');
  const [shownLabel, setShownLabel] = useState(() => themeLabel(isDark));
  const labelRef = useRef<HTMLSpanElement>(null);
  const labelTimer = useRef<number | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const menuId = useId();

  const close = useCallback((returnFocus = false) => {
    setIsShown(false);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const closeMs =
      cssDurationMs('--dropdown-close-dur', 150);
    closeTimer.current = window.setTimeout(() => {
      setOpenOn(null);
      if (returnFocus) triggerRef.current?.focus();
    }, closeMs);
  }, []);

  const open = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    // A menu folded by a route change was never faded out; start it from hidden.
    setIsShown(false);
    setOpenOn(pathname);
  };

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (labelTimer.current) window.clearTimeout(labelTimer.current);
  }, []);

  // The text swap's three phases: the old words leave upward, the new ones are
  // put below with no transition, then released to rise into place. A second
  // press mid-swap restarts it toward the latest choice.
  const swapLabel = (next: string) => {
    const el = labelRef.current;
    if (labelTimer.current) window.clearTimeout(labelTimer.current);
    if (!el) {
      setShownLabel(next);
      return;
    }
    el.classList.remove('is-enter-start');
    el.classList.add('is-exit');
    const swapMs =
      cssDurationMs('--text-swap-dur', 150);
    labelTimer.current = window.setTimeout(() => {
      flushSync(() => setShownLabel(next));
      el.classList.remove('is-exit');
      el.classList.add('is-enter-start');
      void el.offsetWidth;
      el.classList.remove('is-enter-start');
    }, swapMs);
  };

  // A frame after mounting, so the menu transitions in rather than appearing.
  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => setIsShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close]);

  const logOut = async () => {
    setLeaving(true);
    try {
      await onLogout();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div ref={wrapRef} className="account-menu">
      <button
        ref={triggerRef}
        type="button"
        className="account-trigger"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`Account: ${user.name}, ${user.roleLine}`}
        onClick={() => (isOpen ? close() : open())}
      >
        <Avatar user={user} />
        <span className="account-trigger-text" aria-hidden="true">
          <span className="account-name">{user.name}</span>
          <span className="account-role">{user.roleLine}</span>
        </span>
        <ChevronDown size={16} className="account-chevron" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id={menuId}
          className={`action-dropdown-menu account-dropdown t-dropdown ${isShown ? 'is-open' : 'is-closing'}`}
          data-origin="top-right"
        >
          <div className="account-dropdown-head">
            <Avatar user={user} />
            <span className="min-w-0">
              <span className="account-name">{user.name}</span>
              <span className="account-role" title={user.roleLine}>{user.roleLine}</span>
            </span>
          </div>
          <div className="action-dropdown-divider" />
          {settingsSections.map(section => {
            const Icon = SECTION_ICONS[section.key];
            const current = pathname === section.href;
            return (
              <Link
                key={section.key}
                href={section.href}
                className="action-dropdown-item account-dropdown-item"
                aria-current={current ? 'page' : undefined}
                onClick={() => {
                  // The page already on screen changes no route, so it folds here.
                  if (current) close();
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="flex-1">{section.label}</span>
                <LinkPending />
              </Link>
            );
          })}
          <div className="action-dropdown-divider" />
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Dark Mode"
            className="action-dropdown-item account-dropdown-item"
            onClick={() => {
              setSwitchTouched(true);
              onThemeChange(isDark ? 'light' : 'dark');
              swapLabel(themeLabel(!isDark));
            }}
          >
            <span className="t-icon-swap account-theme-icon" data-state={isDark ? 'a' : 'b'} aria-hidden="true">
              <span className="t-icon" data-icon="a"><Moon size={18} /></span>
              <span className="t-icon" data-icon="b"><Sun size={18} /></span>
            </span>
            <span className="flex-1" aria-hidden="true">
              <span ref={labelRef} className="t-text-swap">{shownLabel}</span>
            </span>
            <span
              className={`t-toggle account-theme-switch ${switchTouched ? 'is-init' : ''}`}
              data-on={isDark}
              aria-hidden="true"
            >
              <span className="t-toggle-thumb" />
            </span>
          </button>
          <div className="action-dropdown-divider" />
          <button
            type="button"
            className="action-dropdown-item account-dropdown-item danger"
            onClick={logOut}
            disabled={leaving}
          >
            <LogOut size={18} aria-hidden="true" />
            {leaving ? <BusyLabel>Logging Out</BusyLabel> : <span>Log Out</span>}
          </button>
        </div>
      )}
    </div>
  );
}
