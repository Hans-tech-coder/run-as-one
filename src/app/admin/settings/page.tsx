import React from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import prisma from '@/lib/db';
import { requireActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import AccountSettingsClient from './AccountSettingsClient';

export const metadata: Metadata = {
  title: `Settings | ${SITE_NAME} Admin`,
};

/**
 * The signed-in person's own account settings.
 *
 * Scoped to the person signed in: their display name, the address they sign in
 * with, and their password. Anything that belongs to the whole site — the
 * contact address and the social channels in src/lib/site-contact.ts — is the
 * super admin's to change, and will live on their settings screen instead.
 *
 * For an owner that person is the Organizer row; for a staff member it is their
 * own StaffAccount, never the organizer they work for.
 *
 * The record is read fresh rather than taken from the token, because the token
 * is up to a day old and the super admin can rename or re-fee an organizer in
 * the meantime.
 */
export default async function AdminSettingsPage() {
  const actor = await requireActor();

  const select = { name: true, email: true } as const;
  const account =
    actor.kind === 'STAFF'
      ? await prisma.staffAccount.findUnique({ where: { id: actor.id }, select })
      : await prisma.organizer.findUnique({ where: { id: actor.id }, select });

  // The cookie is valid but the account behind it is gone — a deleted
  // organizer holding a token that has not expired yet. Send them back to the
  // sign-in screen rather than render a form with nothing behind it.
  if (!account) {
    redirect('/admin/login');
  }

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Settings</h1>
      </header>

      <div className="admin-content max-w-4xl mx-auto w-full">
        <AccountSettingsClient organizer={account} />
      </div>
    </>
  );
}
