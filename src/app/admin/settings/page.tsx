import React from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import AccountSettingsClient from './AccountSettingsClient';

export const metadata: Metadata = {
  title: 'Settings | RunAsOne Admin',
};

/**
 * The organizer's own account settings.
 *
 * Scoped to the person signed in: their display name, the address they sign in
 * with, and their password. Anything that belongs to the whole site — the
 * contact address and the social channels in src/lib/site-contact.ts — is the
 * super admin's to change, and will live on their settings screen instead.
 *
 * The record is read fresh rather than taken from the token, because the token
 * is up to a day old and the super admin can rename or re-fee an organizer in
 * the meantime.
 */
export default async function AdminSettingsPage() {
  const auth = await getAuthCookie();
  if (!auth) {
    redirect('/admin/login');
  }

  const organizer = await prisma.organizer.findUnique({
    where: { id: auth.id },
    select: { name: true, email: true },
  });

  // The cookie is valid but the account behind it is gone — a deleted
  // organizer holding a token that has not expired yet. Send them back to the
  // sign-in screen rather than render a form with nothing behind it.
  if (!organizer) {
    redirect('/admin/login');
  }

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Settings</h1>
      </header>

      <div className="admin-content max-w-4xl mx-auto w-full">
        <AccountSettingsClient organizer={organizer} />
      </div>
    </>
  );
}
