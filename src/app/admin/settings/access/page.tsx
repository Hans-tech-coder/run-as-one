import React from 'react';
import type { Metadata } from 'next';
import { requireActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import AccessPanels from '../AccessPanels';

export const metadata: Metadata = {
  title: `Your Access | ${SITE_NAME} Admin`,
};

/**
 * Settings › **Your Access** — read-only: the role and what it reaches
 * (`AccessPanels`), so "why can't I see that event?" answers itself.
 */
export default async function AccessSettingsPage() {
  const actor = await requireActor();

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Your Access</h1>
      </header>

      <div className="admin-content max-w-4xl mx-auto w-full">
        <div className="settings-stack">
          <AccessPanels actor={actor} />
        </div>
      </div>
    </>
  );
}
