/**
 * The trigger that runs the abandoned-checkout sweep.
 *
 * **The rule is not here.** How long an order is left alone, which payment
 * methods may be touched, and what releasing one involves all live in
 * `src/lib/pending-expiry.ts`. This file exists only to decide *who may ask*
 * and to say what happened — so a second trigger (a manual run, a script) can
 * never disagree with this one about the window.
 *
 * **It is not an admin route**, which is why it is not under `/api/admin`.
 * There is no signed-in organizer behind a scheduled job and no cookie to read,
 * so the guard is a shared secret instead: Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` on every invocation when that variable
 * is set on the project. `x-cron-secret` is accepted too, so the sweep can be
 * run by hand with curl without borrowing an auth header that means something
 * else.
 *
 * **An unset secret refuses the request rather than allowing it.** The lazy
 * reading — no secret configured, so skip the check — would leave a route that
 * cancels registrations open to the whole internet on any deployment where the
 * variable was forgotten, which is exactly the deployment where nobody would
 * notice.
 *
 * **GET and POST do the same thing, and that is deliberate.** A write behind a
 * GET is normally the wrong shape, but Vercel Cron only ever issues a GET, and
 * an endpoint the scheduler cannot call is not a schedule. Nothing reaches the
 * sweep without the secret, so the usual danger — a crawler or a link preview
 * firing it by accident — needs the secret first. POST is kept for a person
 * running it by hand, where the verb still says what is about to happen.
 */

import { NextResponse } from 'next/server';
import { expirePendingRegistrations } from '@/lib/pending-expiry';

/**
 * Whether this request carries the shared secret.
 *
 * Checked against both headers Vercel and a human would plausibly use. No
 * timing-safe comparison: the secret is a long random string and every attempt
 * costs a round trip to a serverless function, so a constant-time compare here
 * would be rigour for its own sake — better to say what is true than to imply
 * more than is being done.
 */
function isAuthorized(request: Request, secret: string): boolean {
  const bearer = request.headers.get('authorization');
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get('x-cron-secret') === secret;
}

async function sweep(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to run the expiry sweep.');
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on this deployment.' },
      { status: 503 },
    );
  }

  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await expirePendingRegistrations();

    // Logged as well as returned: the caller is a scheduler that reads nothing,
    // so the function log is where an organizer's "where did that registration
    // go?" is actually answered.
    if (result.expired > 0) {
      console.log(
        `[expire-pending] expired ${result.expired} registration(s), released ` +
          `${result.redemptionsReleased} promo redemption(s)` +
          `${result.truncated ? ' — capped, more remain' : ''}: ` +
          result.orderRefs.join(', '),
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error expiring pending registrations:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}

/** What Vercel Cron calls. */
export const GET = sweep;

/** The same sweep, for a person running it by hand. */
export const POST = sweep;
