import React from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import prisma from '@/lib/db';
import { can, requireActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';
import AccountSettingsClient from './AccountSettingsClient';

export const metadata: Metadata = {
  title: `Settings | ${SITE_NAME} Admin`,
};

/**
 * The signed-in person's own account settings.
 *
 * Scoped to the person signed in: their display name, the address they sign in
 * with, and their password. Below those, and only for somebody holding
 * `platform:manage`, the site-wide admin email (lib/site-settings.ts) — the
 * one address the footer, the legal pages and every email use. Everyone else
 * never sees that panel, and its route refuses them anyway.
 *
 * For an owner that person is the Organizer row; for a staff member it is their
 * own StaffAccount, never the organizer they work for.
 *
 * The record is read fresh rather than taken from the token, because the token
 * is up to a day old and the name or email may have been changed in the
 * meantime.
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

  const siteSettings = can(actor, 'platform:manage', { organizerId: actor.orgId })
    ? await getSiteSettings()
    : null;

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Settings</h1>
      </header>

      <div className="admin-content max-w-4xl mx-auto w-full">
        <AccountSettingsClient organizer={account} siteSettings={siteSettings} />
      </div>
    </>
  );
}
