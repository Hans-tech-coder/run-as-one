import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { RunAsOneLogo } from '@/components/RunAsOneLogo';
import { findReset, resetTargetOf } from '@/lib/password-reset';
import { SITE_NAME } from '@/lib/site-contact';
import ResetPasswordClient from './ResetPasswordClient';

import '../../Auth.css';

/**
 * Where a password-reset email lands (LOGIN_UX_PLAN.md Batch 2).
 *
 * Public and never indexed, like the invitation page; the token is in the
 * address, so the browser is also told not to pass it on as a referrer. An
 * open link shows the new-password form. A used one says so; an expired,
 * unknown or malformed one — or one whose account may no longer reset — reads
 * as expired. Both offer a fresh link.
 */
export const metadata: Metadata = {
  title: `Choose a New Password | ${SITE_NAME}`,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findReset(token);
  const usable = found.state === 'open' && (await resetTargetOf(found.reset)) !== null;

  if (usable) return <ResetPasswordClient token={token} />;

  const used = found.state === 'used';
  return (
    <div className="auth-container">
      <div className="auth-bg-shape orange"></div>
      <div className="auth-bg-shape blue"></div>

      <div className="auth-card">
        <div className="auth-header">
          <RunAsOneLogo variant="stacked" className="[--rao-logo-size:64px] mb-5" />
          <h1 className="auth-title">
            {used ? 'This link was already used' : 'This link has expired'}
          </h1>
          <p className="auth-subtitle">
            {used
              ? 'A reset link works once. If you set a new password with it, sign in with that. If not, request a new link.'
              : 'Reset links work once and only for 60 minutes, and a newer request replaces an older link. Request a new one — it will arrive as a fresh email.'}
          </p>
        </div>

        <Link href="/admin/forgot-password" className="btn-gradient auth-submit text-white font-medium">
          Request a New Link
        </Link>

        <div className="auth-footer">
          <Link href="/admin/login" className="auth-link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
