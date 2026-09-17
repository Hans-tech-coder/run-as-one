import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { can, requireActor } from '@/lib/actor';
import { SITE_NAME } from '@/lib/site-contact';
import OrganizersClient from './OrganizersClient';

export const metadata: Metadata = {
  title: `Organizers | ${SITE_NAME} Admin`,
};

/**
 * Organizer applications and accounts. Batch 3 replaces this screen with `/admin/clients`.
 *
 * It was a `/superadmin` screen until the two dashboards merged
 * (ADMIN_MERGE_PLAN.md, Batch 2); the old address redirects here. The screen
 * itself is a client component that fetches its own list, so this page is the
 * server's check: only a role holding `platform:manage` (owner and admin) is
 * given it, and anyone else gets the admin's own 404, as on the team screen.
 * The API routes it calls ask the same question for themselves.
 */
export default async function Page() {
  const actor = await requireActor();
  if (!can(actor, 'platform:manage', { organizerId: actor.orgId })) {
    notFound();
  }

  return <OrganizersClient />;
}
