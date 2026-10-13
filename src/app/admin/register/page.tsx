import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site-contact';
import { FORM_SUBTITLE, FORM_TITLE } from './apply-steps';
import RegisterClient from './RegisterClient';

/**
 * The service inquiry, server half: only here so the page has a title of its
 * own (SERVICE_INQUIRY_PLAN.md O2). The form is `RegisterClient`. The URL
 * stays `/admin/register`, so links already shared still work.
 */
export const metadata: Metadata = {
  title: `${FORM_TITLE} | ${SITE_NAME}`,
  description: FORM_SUBTITLE,
};

export default function RegisterPage() {
  return <RegisterClient />;
}
