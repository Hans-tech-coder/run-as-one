import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import { organizerCanSignIn } from '@/lib/organizer-status';
import { clientStatusAfter } from '@/lib/client';
import { ROLE_LABELS, asEventRole, asTeamRole } from '@/lib/permissions';
import { SITE_NAME } from '@/lib/site-contact';
import { findOpenInvitation } from '@/lib/team-invite';
import InviteAcceptClient from './InviteAcceptClient';

import '../../Auth.css';

/**
 * Where an invitation email lands.
 *
 * Public — `src/proxy.ts` lets `/admin/invite` through, since the person
 * arriving has no session — and never indexed. The token is in the address,
 * so the page also asks the browser not to send it on as a referrer to
 * anything it links to.
 *
 * A link that is malformed, unknown, already used or expired all get the same
 * page. Which one it was is not something a stranger holding a guessed URL
 * should be able to learn, and the person it was really meant for needs the
 * same next step whichever it was: ask for a new one.
 *
 * A client viewer's invitation (ADMIN_MERGE_PLAN.md, Batch 3) lands here too,
 * and is drawn in its own words — it names the organization rather than a
 * team and a role, since the person is following their own races, not working
 * on Run As One's. An archived client's link reads as expired.
 */
export const metadata: Metadata = {
  title: `Accept Your Invitation | ${SITE_NAME}`,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await findOpenInvitation(token);

  const clientReady =
    invitation?.role !== 'VIEWER' ||
    (invitation.client !== null &&
      (invitation.client.status === 'ACTIVE' ||
        clientStatusAfter(invitation.client.status, 'accept') !== null));

  const usable =
    invitation &&
    clientReady &&
    organizerCanSignIn(invitation.organizer.status) &&
    invitation.staff.status !== 'SUSPENDED';

  if (!usable) {
    return (
      <div className="auth-container">
        <div className="auth-bg-shape orange"></div>
        <div className="auth-bg-shape blue"></div>

        <div className="auth-card">
          <div className="auth-header">
            <RunAsOneLogo variant="stacked" className="[--rao-logo-size:64px] mb-5" />
            <h1 className="auth-title">This link has expired</h1>
            <p className="auth-subtitle">
              Invitation links work once and only for a week. Ask the person who invited you to
              send a new one — it will arrive as a fresh email.
            </p>
          </div>

          <Link href="/admin/login" className="btn-gradient auth-submit text-white font-medium">
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (invitation.role === 'VIEWER' && invitation.client) {
    return (
      <InviteAcceptClient
        token={token}
        organizerName={invitation.organizer.name}
        clientName={invitation.client.name}
        email={invitation.staff.email}
        invitedName={invitation.staff.name}
        hasAccount={Boolean(invitation.staff.password)}
        role="VIEWER"
        events={[]}
      />
    );
  }

  const role = asTeamRole(invitation.role) ?? 'STAFF';

  return (
    <InviteAcceptClient
      token={token}
      organizerName={invitation.organizer.name}
      email={invitation.staff.email}
      invitedName={invitation.staff.name}
      hasAccount={Boolean(invitation.staff.password)}
      role={role}
      events={
        role === 'ADMIN'
          ? []
          : invitation.assignments.map(assignment => ({
              title: assignment.event.title,
              roleLabel: ROLE_LABELS[asEventRole(assignment.role) ?? 'VIEWER'],
            }))
      }
    />
  );
}
