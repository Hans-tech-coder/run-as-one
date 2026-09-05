import React from 'react';
import { getSignedInUser } from '@/lib/signed-in-user';
import SuperAdminShell from './SuperAdminShell';

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
  const user = await getSignedInUser();

  return <SuperAdminShell user={user}>{children}</SuperAdminShell>;
}
