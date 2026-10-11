import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site-contact';
import ForgotPasswordClient from './ForgotPasswordClient';

import '../Auth.css';

/**
 * "Forgot password?" from the sign-in page (LOGIN_UX_PLAN.md Batch 2). Public —
 * `PUBLIC_ADMIN_PATHS` lets it through — and never indexed. Who actually gets
 * a link is lib/password-reset.ts's rule; this page says the same thing to
 * everyone.
 */
export const metadata: Metadata = {
  title: `Reset Your Password | ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
