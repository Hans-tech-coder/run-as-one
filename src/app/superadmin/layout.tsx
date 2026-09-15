import React from 'react';
import { cookies } from 'next/headers';
import { getSignedInUser } from '@/lib/signed-in-user';
import SuperAdminShell from './SuperAdminShell';
import { SIDEBAR_COOKIE, isSidebarCollapsed } from '../admin/dashboard-sidebar';

/**
 * Same split as the organizer layout: the server reads who is signed in, the
 * client shell owns the mobile menu and the active-link state. A superadmin is
 * an Organizer row with role SUPER_ADMIN, so the name comes from the same
 * place — the sidebar shows the person, not the literal words "Super Admin".
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, cookieStore] = await Promise.all([getSignedInUser(), cookies()]);
  const initialCollapsed = isSidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value);

  return (
    <SuperAdminShell user={user} initialCollapsed={initialCollapsed}>
      {children}
    </SuperAdminShell>
  );
}
