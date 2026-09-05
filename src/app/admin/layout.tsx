import React from 'react';
import { getSignedInUser } from '@/lib/signed-in-user';
import AdminShell from './AdminShell';

/**
 * The sidebar names the organizer who is signed in, so the layout is a server
 * component: it reads the account from the auth cookie and hands it to the
 * client shell that owns the mobile menu and the active-link state. Rendering
 * it on the server means an edit to the name shows up on the next
 * `router.refresh()`, with no client fetch to keep in sync.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSignedInUser();

  return <AdminShell user={user}>{children}</AdminShell>;
}
