import { NextResponse } from 'next/server';
import { getActor } from '@/lib/actor';
import { GOOGLE_CALLBACK_PATH, googleAuthUrl } from '@/lib/google-oauth';
import { asStepUpAction, asStepUpTarget, stepUpMethods } from '@/lib/step-up';
import { ownAccount } from '@/lib/two-factor';
import { stepUpPopup } from './popup';

/**
 * "Confirm with Google", step one (lib/step-up.ts): opened in a popup by
 * StepUpDialog for a signed-in staff member whose account is linked to Google.
 * Sends the popup to Google with `prompt=login` and `max_age`, so Google signs
 * the person in again rather than nodding through the session it already has.
 *
 * It comes back through the sign-in callback (`/api/auth/google/callback`) —
 * the one redirect URI already registered on the Google client — where the
 * pending cookie's `stepUp` part turns the callback into a confirmation that
 * **never sets or changes a session**.
 *
 * `?action=` / `?target=` name what is being confirmed, `?ref=` is the
 * dialog's random id for matching the answer. Every refusal answers the popup
 * page, never a redirect to the sign-in page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Checked on read: even a refusal echoes `ref` to the page, signed in or not.
  const rawRef = url.searchParams.get('ref') ?? '';
  const ref = /^[A-Za-z0-9_-]{8,64}$/.test(rawRef) ? rawRef : '';
  const fail = (error: string) => stepUpPopup({ type: 'step-up', ref, ok: false, error });

  const actor = await getActor();
  if (!actor) return fail('Your session has ended. Sign in again.');

  const action = asStepUpAction(url.searchParams.get('action'));
  const target = asStepUpTarget(url.searchParams.get('target'));
  if (!action || !target || !ref) return fail('This confirmation link is not complete.');

  const account = await ownAccount(actor);
  if (!account || !stepUpMethods(account).includes('google')) {
    return fail('Google is not linked to your sign-in. Confirm with your password instead.');
  }
  // Not throttled here: this only sends the popup to Google. The callback
  // counts the try (STEP_UP_RULE) where the answer is judged.

  const location = await googleAuthUrl({
    redirectUri: `${url.origin}${GOOGLE_CALLBACK_PATH}`,
    next: '/admin',
    keep: false,
    stepUp: { kind: actor.kind, id: actor.id, action, target, ref, startedAt: Date.now() },
  });
  return NextResponse.redirect(location);
}
