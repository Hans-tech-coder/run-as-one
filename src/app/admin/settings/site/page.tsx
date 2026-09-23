import React from 'react';
import { forbidden } from 'next/navigation';
import type { Metadata } from 'next';
import prisma from '@/lib/db';
import { can, requireActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';
import { PlatformFeePanel, SiteEmailPanel, SocialLinksPanel } from '../SettingsPanels';
import DashboardHeader from '@/app/admin/DashboardHeader';

export const metadata: Metadata = {
  title: `Site Settings | ${SITE_NAME} Admin`,
};

/**
 * Settings › **Site Settings** — what the whole site runs on rather than the
 * person signed in:
 *
 * - **Admin Email** and **Social Links** — `platform:manage` (Super Admin and
 *   Admin): the one address the footer, the legal pages and every email use,
 *   and the footer's social icons. Two forms, each saving alone.
 * - **Default Platform Fee** — `org:settings` only (the Super Admin): what a
 *   new event's Admin Fee starts at, stored on the Organizer row. Existing
 *   events keep their own fee.
 *
 * Anyone holding neither is answered with `forbidden()`; the account menu
 * does not offer them the page.
 */
export default async function SiteSettingsPage() {
  const actor = await requireActor();
  const platform = can(actor, 'platform:manage', { organizerId: actor.orgId });
  const orgSettings = can(actor, 'org:settings', { organizerId: actor.orgId });
  if (!platform && !orgSettings) forbidden();

  const [siteSettings, organizerSettings] = await Promise.all([
    platform ? getSiteSettings() : null,
    orgSettings
      ? prisma.organizer.findUnique({ where: { id: actor.orgId }, select: { adminFee: true } })
      : null,
  ]);

  return (
    <>
      <DashboardHeader title="Site Settings" />

      <div className="admin-content max-w-4xl mx-auto w-full">
        <div className="settings-stack">
          {siteSettings && (
            <>
              <SiteEmailPanel settings={{ contactEmail: siteSettings.contactEmail }} />
              <SocialLinksPanel settings={{ socialLinks: siteSettings.socialLinks }} />
            </>
          )}
          {organizerSettings && <PlatformFeePanel adminFee={organizerSettings.adminFee} />}
        </div>
      </div>
    </>
  );
}
