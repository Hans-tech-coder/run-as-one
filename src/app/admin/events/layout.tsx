import React from 'react';
import { requireTeamActor } from '@/lib/actor';

/**
 * The Events section is Run As One's team's work, never a client viewer's
 * (ADMIN_MERGE_PLAN.md, Batch 4).
 *
 * The table, registrants and results pages ask `requireTeamActor()`
 * themselves; this layout is for the two that cannot — New Event and Edit
 * Event are client components, and `forbidden()` is thrown on the server. A
 * layout does not re-run on a navigation inside the section, which is why the
 * server pages keep their own check and why neither form's route trusts this:
 * `admin/events` POST and `admin/events/[id]` GET / PUT refuse a viewer by
 * `can()` on every request.
 */
export default async function AdminEventsLayout({ children }: { children: React.ReactNode }) {
  await requireTeamActor();
  return <>{children}</>;
}
