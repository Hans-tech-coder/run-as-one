import React from 'react';
import type { Metadata } from 'next';
import { requireActor } from '@/lib/actor';
import { formatEventInstant } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import { loadOwnAccount } from '../account';
import { PasswordPanel, SignInActivityPanel } from '../SettingsPanels';
import DashboardHeader from '@/app/admin/DashboardHeader';

export const metadata: Metadata = {
  title: `Security | ${SITE_NAME} Admin`,
};

/**
 * Settings › **Security**, for everyone: **Password** (a change signs out
 * every other device), then **Sign-in Activity** — the last sign-in
 * (`lastLoginAt`, on both account tables) and *Sign out other devices*.
 */
export default async function SecuritySettingsPage() {
  const actor = await requireActor();
  const account = await loadOwnAccount(actor);

  return (
    <>
      <DashboardHeader title="Security" />

      <div className="admin-content max-w-4xl mx-auto w-full">
        <div className="settings-stack">
          <PasswordPanel />
          <SignInActivityPanel
            lastSignIn={account.lastLoginAt ? formatEventInstant(account.lastLoginAt) : null}
          />
        </div>
      </div>
    </>
  );
}
