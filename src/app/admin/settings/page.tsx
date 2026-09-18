import React from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import prisma from '@/lib/db';
import { can, isClientViewer, requireActor } from '@/lib/actor';
import { formatEventInstant } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import { getContactEmail, getSiteSettings } from '@/lib/site-settings';
import AccessPanels from './AccessPanels';
import {
  PasswordPanel,
  PlatformFeePanel,
  ProfilePanel,
  SignInActivityPanel,
  SiteEmailPanel,
  SocialLinksPanel,
} from './SettingsPanels';

export const metadata: Metadata = {
  title: `Settings | ${SITE_NAME} Admin`,
};

/**
 * The signed-in person's settings, one page of panels top to bottom — the
 * owner asked for no section tabs:
 *
 * 1. **Profile** — photo, name, sign-in email and, for a staff account, a
 *    mobile number. The Organizer row has no phone column, so the owner's form
 *    has none. A client viewer's email is read-only (only Run As One's staff
 *    change it) and the form names the admin email to write to.
 * 2. **Password**, then **Sign-in Activity** — the last sign-in
 *    (`lastLoginAt`, on both account tables) and **Sign out other devices**,
 *    for everyone.
 * 3. **Admin Email** and **Social Links** — `platform:manage` only (Super
 *    Admin and Admin): the one address the footer, the legal pages and every
 *    email use, and the footer's social icons. Two forms, each saving alone.
 * 4. **Default Platform Fee** — `org:settings` only (the Super Admin): what a
 *    new event's Admin Fee starts at, stored on the Organizer row. Existing
 *    events keep their own fee.
 * 5. **Your Role** and what it reaches (AccessPanels), read-only.
 *
 * For an owner "the person" is the Organizer row; for a staff member (and a
 * client viewer) it is their own StaffAccount, never the organizer they work
 * for. The record is read fresh rather than taken from the token, because the
 * token is up to a day old and the details may have changed since.
 */
export default async function AdminSettingsPage() {
  const actor = await requireActor();
  const isStaff = actor.kind === 'STAFF';

  // The Organizer row has no phone column; its phone is always null.
  const account = isStaff
    ? await prisma.staffAccount.findUnique({
        where: { id: actor.id },
        select: { name: true, email: true, phone: true, avatarUrl: true, lastLoginAt: true },
      })
    : await prisma.organizer
        .findUnique({
          where: { id: actor.id },
          select: { name: true, email: true, avatarUrl: true, lastLoginAt: true },
        })
        .then(row => (row ? { ...row, phone: null } : null));

  // The cookie is valid but the account behind it is gone — a deleted
  // organizer holding a token that has not expired yet. Send them back to the
  // sign-in screen rather than render a form with nothing behind it.
  if (!account) {
    redirect('/admin/login');
  }

  const platform = can(actor, 'platform:manage', { organizerId: actor.orgId });
  const orgSettings = can(actor, 'org:settings', { organizerId: actor.orgId });
  const [emailLockedTo, siteSettings, organizerSettings] = await Promise.all([
    isClientViewer(actor) ? getContactEmail() : null,
    platform ? getSiteSettings() : null,
    orgSettings
      ? prisma.organizer.findUnique({ where: { id: actor.orgId }, select: { adminFee: true } })
      : null,
  ]);

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Settings</h1>
      </header>

      <div className="admin-content max-w-4xl mx-auto w-full">
        <div className="settings-stack">
          <ProfilePanel
            profile={{
              name: account.name,
              email: account.email,
              phone: account.phone,
              avatarUrl: account.avatarUrl,
            }}
            nameLabel={isStaff ? 'Full Name' : 'Organizer Name'}
            hasPhone={isStaff}
            emailLockedTo={emailLockedTo}
          />

          <PasswordPanel />

          <SignInActivityPanel
            lastSignIn={account.lastLoginAt ? formatEventInstant(account.lastLoginAt) : null}
          />

          {siteSettings && (
            <>
              <SiteEmailPanel settings={{ contactEmail: siteSettings.contactEmail }} />
              <SocialLinksPanel settings={{ socialLinks: siteSettings.socialLinks }} />
            </>
          )}

          {organizerSettings && <PlatformFeePanel adminFee={organizerSettings.adminFee} />}

          <AccessPanels actor={actor} />
        </div>
      </div>
    </>
  );
}
