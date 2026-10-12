import React from 'react';
import type { Metadata } from 'next';
import { requireActor } from '@/lib/actor';
import { formatEventInstant } from '@/lib/event-schedule';
import { SITE_NAME } from '@/lib/site-contact';
import { loadOwnAccount } from '../account';
import { PasswordPanel, SignInActivityPanel } from '../SettingsPanels';
import GooglePanel from '../GooglePanel';
import { googleSignInConfigured } from '@/lib/google-oauth';
import DashboardHeader from '@/app/admin/DashboardHeader';

export const metadata: Metadata = {
  title: `Security | ${SITE_NAME} Admin`,
};

/**
 * Settings › **Security**, for everyone: **Password** (a change signs out
 * every other device), then **Google Sign-in** for staff and client viewers
 * (linked or not, and *Unlink*; shown once Google sign-in is set up, or while
 * a link remains), then **Sign-in Activity** — the last sign-in
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
          {actor.kind === 'STAFF' && (account.googleLinked || googleSignInConfigured()) ? (
            <GooglePanel linked={account.googleLinked} email={account.email} />
          ) : null}
          <SignInActivityPanel
            lastSignIn={account.lastLoginAt ? formatEventInstant(account.lastLoginAt) : null}
          />
        </div>
      </div>
    </>
  );
}
