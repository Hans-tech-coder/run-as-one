import React from 'react';
import type { Metadata } from 'next';
import { isClientViewer, requireActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import { getContactEmail } from '@/lib/site-settings';
import { loadOwnAccount } from './account';
import { ProfilePanel } from './SettingsPanels';
import DashboardHeader from '@/app/admin/DashboardHeader';

export const metadata: Metadata = {
  title: `Profile | ${SITE_NAME} Admin`,
};

/**
 * Settings › **Profile** — the first of the settings pages the account menu
 * lists (`sections.ts`): photo, name, sign-in email and, for a staff account,
 * a mobile number. The Organizer row has no phone column, so the owner's form
 * has none. A client viewer's email is read-only (only Run As One's staff
 * change it) and the form names the admin email to write to.
 */
export default async function ProfileSettingsPage() {
  const actor = await requireActor();
  const isStaff = actor.kind === 'STAFF';
  const [account, emailLockedTo] = await Promise.all([
    loadOwnAccount(actor),
    isClientViewer(actor) ? getContactEmail() : null,
  ]);

  return (
    <>
      <DashboardHeader title="Profile" />

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
        </div>
      </div>
    </>
  );
}
