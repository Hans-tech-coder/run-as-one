"use client";

import React from 'react';
import { ShieldOff } from 'lucide-react';
import TwoStepChip from '../TwoStepChip';
import { MEMBER_STATE_LABELS, MEMBER_STATE_TONES, memberState } from '@/lib/team';
import { invitedOn, type ClientViewerRow } from './application-rows';
import { Section } from './ApplicationSection';

/**
 * ApplicationPanel's **Sign-ins**: who has been invited to sign in for this
 * client and where each invitation stands (`memberState`, the team screen's
 * own badge). A viewer with two-step sign-in on is marked, and the reset for
 * a lost phone sits on that person's line (TWO_FACTOR_PLAN.md D4), because a
 * client may have more than one sign-in and the reset is about one of them.
 */
export default function SignInsSection({
  viewers,
  onResetTwoFactor,
}: {
  viewers: ClientViewerRow[];
  onResetTwoFactor: (viewer: ClientViewerRow) => void;
}) {
  return (
    <Section title="Sign-ins" list>
      {viewers.map(viewer => {
        const state = memberState({
          acceptedAt: viewer.acceptedAt,
          suspendedAt: viewer.suspendedAt,
          inviteExpiresAt: viewer.inviteExpiresAt,
          accountStatus: viewer.staff.status,
        });
        return (
          <li
            key={viewer.id}
            className="min-w-0 sm:col-span-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--ink-85)] [overflow-wrap:anywhere]">
                <span className="min-w-0">{viewer.staff.name}</span>
                {viewer.twoFactorOn && <TwoStepChip />}
              </div>
              <div className="text-xs text-secondary [overflow-wrap:anywhere]">
                {viewer.staff.email} · Invited {invitedOn(viewer.invitedAt)}
              </div>
            </div>
            <span className={`status-badge ${MEMBER_STATE_TONES[state]} shrink-0`}>
              {MEMBER_STATE_LABELS[state]}
            </span>
            {viewer.twoFactorOn && (
              <button
                type="button"
                className="btn-filter is-danger"
                onClick={() => onResetTwoFactor(viewer)}
                aria-label={`Reset two-step sign-in for ${viewer.staff.name}`}
              >
                <ShieldOff size={16} aria-hidden="true" />
                Reset Two-Step Sign-in
              </button>
            )}
          </li>
        );
      })}
    </Section>
  );
}
