"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Calendar, Settings, LogOut, Menu, X, Megaphone, UsersRound } from 'lucide-react';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import LinkPending from '@/components/ui/LinkPending';
import type { SignedInUser } from '@/lib/signed-in-user';
import OrganizerSwitcher from './OrganizerSwitcher';
import './Admin.css';

/** The pages somebody reaches before they have a session, drawn without the sidebar. */
const BARE_PATHS = ['/admin/login', '/admin/register', '/admin/invite'];

export default function AdminShell({
  user,
  children,
}: {
  user: SignedInUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (BARE_PATHS.some(path => pathname.startsWith(path))) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    // The session cookie is httpOnly, so only a route can clear it.
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  // Only the screens this person's role opens (lib/signed-in-user.ts). The
  // pages check again for themselves; this is what keeps a validator from
  // being offered a Marketing link that would only answer with a 404.
  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: <LayoutDashboard size={20} /> },
    { name: 'Events', path: '/admin/events', icon: <Calendar size={20} /> },
    ...((user?.nav.marketing ?? true)
      ? [{ name: 'Marketing Tools', path: '/admin/marketing', icon: <Megaphone size={20} /> }]
      : []),
    ...(user?.nav.team
      ? [{ name: 'Team', path: '/admin/team', icon: <UsersRound size={20} /> }]
      : []),
    { name: 'Settings', path: '/admin/settings', icon: <Settings size={20} /> },
  ];

  // An owner is simply the Owner. Anyone else is named with the organizer
  // they are working inside, since the same person may hold a different role
  // at another one.
  const roleLine = !user
    ? 'Organizer Admin'
    : user.roleLabel === 'Owner'
      ? 'Owner'
      : `${user.roleLabel} · ${user.organizerName}`;

  return (
    <div className="admin-layout">
      {/* Mobile Menu Toggle */}
      <div className="mobile-menu-toggle">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="mobile-menu-btn"
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="admin-brand flex items-center gap-3 font-bold text-xl px-6 py-4">
          <RunAsOneLogo className="[--rao-logo-size:38px]" />
        </div>

        <nav className="admin-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`admin-nav-item ${pathname === item.path ? 'active' : ''}`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {item.icon}
              {item.name}
              <LinkPending />
            </Link>
          ))}
        </nav>

        {user && user.organizers.length > 1 && (
          <OrganizerSwitcher organizers={user.organizers} />
        )}

        <div className="admin-user">
          <div className="admin-user-avatar">
            {user?.initial ?? 'O'}
          </div>
          <div className="admin-user-info">
            <div className="admin-user-name">{user?.name ?? 'Organizer'}</div>
            <div className="admin-user-role" title={roleLine}>{roleLine}</div>
          </div>
          <button onClick={handleLogout} className="admin-logout" title="Logout" aria-label="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
