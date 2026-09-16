import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireActor } from '@/lib/actor';
import { loadActivityPage } from '@/lib/activity-store';
import { SITE_NAME } from '@/lib/site-contact';
import ActivityClient, { type ActivityRow } from '../../admin/activity/ActivityClient';

export const metadata: Metadata = {
  title: `Activity | ${SITE_NAME} Super Admin`,
};

/**
 * The super admin's own trail: who approved, rejected, suspended or reinstated
 * which organizer account, and when — plus the super admin's sign-ins.
 *
 * It is the organizer Activity screen (`ActivityClient`, `scope="platform"`)
 * reading a different trail, not a second design: the same filters in the URL,
 * the same pinned paging, the same cards below `lg`. Its rows live under the
 * super admin's own `orgId`, because a decision about an organizer is not
 * something that happened inside that organizer's dashboard, and the
 * organizer's screen shows each actor's IP address and device.
 *
 * `proxy.ts` already keeps everyone but a super admin out of `/superadmin`;
 * the page checks again rather than trust that one door.
 */
export default async function SuperAdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  if (actor.kind !== 'SUPER_ADMIN') notFound();

  const reading = await loadActivityPage(actor.orgId, await searchParams);
  const rows: ActivityRow[] = reading.entries.map(entry => ({ ...entry, eventTitle: null }));

  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Activity</h1>
      </header>

      <div className="admin-content">
        <ActivityClient
          scope="platform"
          rows={rows}
          total={reading.total}
          newer={reading.newer}
          filters={reading.filters}
          pinned={reading.pinned}
          errors={reading.errors}
          people={reading.people}
          events={[]}
          now={reading.now}
        />
      </div>
    </>
  );
}
