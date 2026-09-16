"use client";

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Calendar, Settings, Megaphone, UsersRound, History } from 'lucide-react';
import type { SignedInUser } from '@/lib/signed-in-user';
import DashboardShell from './DashboardShell';
import OrganizerSwitcher from './OrganizerSwitcher';
import { isBarePath } from './bare-paths';
import './Admin.css';

/**
 * The organizer dashboard's frame. What is only true of `/admin` lives here:
 * which links this person's role opens, how their role reads, and the
 * organizer switcher. The sidebar, the phone's drawer and the user block are
 * `DashboardShell`, shared with the superadmin.
 */

export default function AdminShell({
  user,
  initialCollapsed,
  children,
}: {
  user: SignedInUser | null;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // The sign-in pages, drawn without the sidebar (bare-paths.ts, which
  // `admin/loading.tsx` reads too so the wait matches the page).
  if (isBarePath(pathname)) {
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
    ...(user?.nav.activity
      ? [{ name: 'Activity', path: '/admin/activity', icon: <History size={20} /> }]
      : []),
  ];

  // Below the divider with Log Out: the account's own screen, not a page of
  // the organizer's work.
  const accountItems = [
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
    <DashboardShell
      navItems={navItems}
      secondaryNavItems={accountItems}
      initialCollapsed={initialCollapsed}
      userBlock={{
        name: user?.name ?? 'Organizer',
        initial: user?.initial ?? 'O',
        roleLine,
      }}
      beforeUser={
        user && user.organizers.length > 1
          ? <OrganizerSwitcher organizers={user.organizers} />
          : null
      }
      onLogout={handleLogout}
    >
      {children}
    </DashboardShell>
  );
}
