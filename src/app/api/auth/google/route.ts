import { NextResponse } from 'next/server';
import { GOOGLE_CALLBACK_PATH, googleAuthUrl, googleSignInConfigured } from '@/lib/google-oauth';
import { safeNextPath } from '@/lib/next-path';
import { backToSignIn } from './login-redirect';

/**
 * "Continue with Google", step one: send the browser to Google with a fresh
 * state, nonce and PKCE challenge (lib/google-oauth.ts). `?next=` is the
 * admin page to land on afterwards, checked by `safeNextPath` here and again
 * on the way back.
 *
 * The redirect URI is built from this request's own origin, so production,
 * a preview and localhost each come back to themselves — every one of them
 * has to be listed on the Google OAuth client.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next'));

  if (!googleSignInConfigured()) {
    return backToSignIn(request, 'google_unavailable', next);
  }

  const location = await googleAuthUrl({
    redirectUri: `${url.origin}${GOOGLE_CALLBACK_PATH}`,
    next,
  });
  return NextResponse.redirect(location);
}
