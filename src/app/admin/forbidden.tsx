import React from 'react';
import { EyeOff } from 'lucide-react';
import AdminNotFound from './AdminNotFound';

/**
 * What a client viewer sees on any dashboard screen that is Run As One's
 * team's work (ADMIN_MERGE_PLAN.md, Batch 4) — thrown by `forbidden()` in
 * `requireTeamActor()` (lib/actor.ts), answered with a 403 and drawn inside
 * the sidebar the viewer arrived with.
 *
 * Only a viewer reaches it: the team's own refusals stay the admin's 404, so a
 * staff member probing another race's id still cannot tell a missing event
 * from one they may not open. A viewer is refused before any page reads
 * anything, so the words here are the same for every address and name no
 * record. They say what the viewer's sign-in *is* for, because somebody who
 * followed a link a colleague pasted from the team's dashboard is not doing
 * anything wrong and should be pointed at what they can open.
 */
export default function AdminForbiddenPage() {
  return (
    <AdminNotFound
      icon={EyeOff}
      title="Not Part of Your View"
      heading="This screen is for the Run As One team"
      body="Your sign-in shows your organization's events and how many runners have registered for each. Payments, runner details and results are handled by Run As One. Contact Run As One if you need anything more."
      homeHref="/admin"
      homeLabel="Back to Your Events"
    />
  );
}
