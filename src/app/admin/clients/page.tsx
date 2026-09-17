import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { can, requireTeamActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import ClientsClient from './ClientsClient';

export const metadata: Metadata = {
  title: `Clients | ${SITE_NAME} Admin`,
};

/**
 * The client submissions, and Send invite (ADMIN_MERGE_PLAN.md, Batch 3).
 *
 * It replaced `/admin/organizers`, which now redirects here (next.config.ts),
 * as does its older `/superadmin/organizers` address. The screen itself is a
 * client component that fetches its own list, so this page is the server's
 * check: only a role holding `platform:manage` (owner and admin) is given it,
 * and anyone else gets the admin's own 404. The API routes it calls ask the
 * same question for themselves.
 */
export default async function Page() {
  const actor = await requireTeamActor();
  if (!can(actor, 'platform:manage', { organizerId: actor.orgId })) {
    notFound();
  }

  return <ClientsClient />;
}
