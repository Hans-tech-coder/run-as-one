import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SITE_NAME } from '@/lib/site-contact';
import { readPendingTwoFactor } from '@/lib/two-factor-pending';
import TwoFactorClient from './TwoFactorClient';

import '../Auth.css';

/**
 * The second sign-in step (TWO_FACTOR_PLAN.md 3.3), where a password or a
 * Google sign-in lands for an account with two-step sign-in on. Public —
 * `PUBLIC_ADMIN_PATHS` lets it through, since there is no session yet — and
 * never indexed. Without a valid pending cookie (lib/two-factor-pending.ts)
 * there is nothing to finish here, so it goes back to the sign-in page.
 */
export const metadata: Metadata = {
  title: `Two-Step Sign-in | ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

export default async function TwoFactorPage() {
  if (!(await readPendingTwoFactor())) redirect('/admin/login');
  return <TwoFactorClient />;
}
