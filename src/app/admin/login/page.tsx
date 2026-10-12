import { redirect } from 'next/navigation';
import { getActor } from '@/lib/actor';
import { safeNextPath } from '@/lib/next-path';
import { signInErrorMessage } from '@/lib/sign-in-errors';
import { googleSignInConfigured } from '@/lib/google-oauth';
import LoginClient from './LoginClient';

import '../Auth.css';

/**
 * The sign-in page, server half.
 *
 * A person already signed in has nothing to do here and goes on to the page
 * they asked for (or the dashboard). That check is `getActor()`, not the proxy:
 * the proxy only verifies the token's signature, so a session ended by "Sign
 * out other devices", a suspension or an archived client still looks valid
 * there — sending it from here to `/admin` would have `requireActor()` send it
 * straight back, for ever. `getActor()` checks the record, so a revoked
 * session gets the form.
 *
 * `?reset=1` is where a password reset lands (lib/password-reset.ts, D3 of
 * LOGIN_UX_PLAN.md): the form, with a "Password updated" banner.
 *
 * `?error=<code>` is where a refused Google sign-in lands (Batch 3). Only a
 * code in lib/sign-in-errors.ts shows anything, so a link cannot make this
 * page say words of its own. The Google button is shown only once
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  if (await getActor()) {
    redirect(next);
  }

  return (
    <LoginClient
      next={next}
      passwordReset={params.reset === '1'}
      initialError={signInErrorMessage(params.error)}
      googleEnabled={googleSignInConfigured()}
    />
  );
}
