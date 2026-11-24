import React from 'react';
import { cookies } from 'next/headers';
import { getSignedInUser } from '@/lib/signed-in-user';
import AdminShell from './AdminShell';
import { SIDEBAR_COOKIE, isSidebarCollapsed } from './dashboard-sidebar';
import { THEME_COOKIE, readDashboardTheme } from './dashboard-theme';

/**
 * The sidebar names the organizer who is signed in, so the layout is a server
 * component: it reads the account from the auth cookie and hands it to the
 * client shell that owns the mobile menu and the active-link state. Rendering
 * it on the server means an edit to the name shows up on the next
 * `router.refresh()`, with no client fetch to keep in sync. It also reads the
 * sidebar cookie, so a collapsed rail is drawn collapsed on the first paint,
 * and the theme cookie, so a light dashboard never flashes dark first.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, cookieStore] = await Promise.all([getSignedInUser(), cookies()]);
  const initialCollapsed = isSidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value);
  const initialTheme = readDashboardTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <AdminShell user={user} initialCollapsed={initialCollapsed} initialTheme={initialTheme}>
      {children}
    </AdminShell>
  );
}
