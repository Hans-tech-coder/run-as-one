"use client";

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2,
  Calendar,
  Flag,
  History,
  LayoutDashboard,
  HandCoins,
  Megaphone,
  MessageSquare,
  UsersRound,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/permissions';
import type { SignedInUser } from '@/lib/signed-in-user';
import DashboardShell from './DashboardShell';
import AccountMenu from './AccountMenu';
import { SETTINGS_SECTIONS } from './settings/sections';
import NotificationsCenter from './NotificationsCenter';
import { DashboardNavProvider } from './dashboard-nav';
import { isBarePath } from './bare-paths';
import './Admin.css';

/**
 * The dashboard's frame. What is only true of `/admin` lives here: which links
 * this person's role opens and how their role reads. The sidebar and the
 * phone's rail are `DashboardShell`; the person, Settings and Log Out are
 * `AccountMenu`, beside the bell in the header.
 *
 * **There is one dashboard.** The super admin had a shell of its own at
 * `/superadmin` until ADMIN_MERGE_PLAN.md's Batch 2; its screens — organizer
 * applications, communities and feedback — are now links here for whoever
 * holds `platform:manage`, and its old addresses redirect (next.config.ts).
 * The organizer switcher went with it: Run As One is the one tenant, so a
 * staff member has nothing to switch between.
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
    // And drop the cached layout that still names the person who just left,
    // so the next sign-in in this browser cannot inherit their sidebar.
    router.refresh();
  };

  // Only the screens this person's role opens (lib/signed-in-user.ts). The
  // pages check again for themselves; this is what keeps a validator from
  // being offered a Marketing link that would only answer with a 404.
  // Run As One's own screens sit between the race work and the people work.
  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: <LayoutDashboard size={20} /> },
    // Everyone on Run As One's team; never a client viewer, whose sidebar is
    // Dashboard and Settings alone (ADMIN_MERGE_PLAN.md, Batch 4).
    ...((user?.nav.events ?? true)
      ? [{ name: 'Events', path: '/admin/events', icon: <Calendar size={20} /> }]
      : []),
    ...((user?.nav.marketing ?? true)
      ? [{ name: 'Marketing Tools', path: '/admin/marketing', icon: <Megaphone size={20} /> }]
      : []),
    // What Run As One owes each race's organizer (ADMIN_MERGE_PLAN.md,
    // Batch 6) — money, so it sits first among Run As One's own screens.
    ...(user?.nav.remittances
      ? [{ name: 'Remittances', path: '/admin/remittances', icon: <HandCoins size={20} /> }]
      : []),
    ...(user?.nav.platform
      ? [
          { name: 'Clients', path: '/admin/clients', icon: <Building2 size={20} /> },
          { name: 'Communities', path: '/admin/communities', icon: <Flag size={20} /> },
          { name: 'Feedback', path: '/admin/feedback', icon: <MessageSquare size={20} /> },
        ]
      : []),
    ...(user?.nav.team
      ? [{ name: 'Team', path: '/admin/team', icon: <UsersRound size={20} /> }]
      : []),
    ...(user?.nav.activity
      ? [{ name: 'Activity', path: '/admin/activity', icon: <History size={20} /> }]
      : []),
  ];

  // Run As One's own account is simply the Super Admin (ROLE_LABELS.OWNER).
  // Anyone else is named with the organizer they are working inside — or a
  // client viewer with its own client (signed-in-user.ts).
  // A viewer whose client has no name left reads as its role alone.
  const roleLine = !user
    ? 'Organizer Admin'
    : user.roleLabel === ROLE_LABELS.OWNER
      ? ROLE_LABELS.OWNER
      : user.organizerName
        ? `${user.roleLabel} · ${user.organizerName}`
        : user.roleLabel;

  return (
    <DashboardNavProvider value={user?.nav ?? null}>
      <DashboardShell
        navItems={navItems}
        initialCollapsed={initialCollapsed}
        // Everyone signed in gets the bell; what it lists is their
        // permissions' business (lib/notification-store.ts). The account
        // menu is always there, so Log Out can never be out of reach.
        headerAccessory={
          <>
            {user && <NotificationsCenter />}
            <AccountMenu
              user={{
                name: user?.name ?? 'Organizer',
                initial: user?.initial ?? 'O',
                avatarUrl: user?.avatarUrl ?? null,
                roleLine,
              }}
              settingsSections={SETTINGS_SECTIONS.filter(
                section => !section.platformOnly || user?.nav.platform,
              )}
              onLogout={handleLogout}
            />
          </>
        }
      >
        {children}
      </DashboardShell>
    </DashboardNavProvider>
  );
}
