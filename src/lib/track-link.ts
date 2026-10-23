/**
 * The Track My Registration link (`/track/<token>`, TRACK_PAGE_PLAN.md D8): the
 * one in both registration emails, so a runner sees their status without typing
 * a reference and an email.
 *
 * **The same stateless token as the resume-payment link** (lib/resume-payment.ts),
 * of its own kind: a JWT signed with the app's one secret, `purpose: 'track'`,
 * the order's id as its subject. Each reader refuses every other purpose, so
 * this token opens no payment page and a payment token opens no track page.
 * Nothing stores it, and nothing needs to: the page reads the order every time
 * it is opened, and a removed order is "not found" however valid the token.
 *
 * **It carries the §4 scope it was earned with.** No `runners` claim means the
 * whole order — the emails go to the order's contact, who typed all of it. A
 * `runners` claim lists the runner numbers a lookup proved (a runner's own
 * email, or a runner reference), so a token minted for one runner never shows
 * another. The lookup route hands its caller a short-lived one of these for
 * *Resend my confirmation email*, so that button proves the same thing the
 * lookup did without the browser keeping the email.
 *
 * What it opens is decided by who can end up holding it: the email gets
 * forwarded, so the page shows only the masked details of §5.
 */

import { SignJWT, jwtVerify } from 'jose';
import prisma from '@/lib/db';
import { SECRET_KEY } from '@/lib/jwt';
import { eventOrigin } from '@/lib/site-host';

const PURPOSE = 'track';

/** How long an emailed link works: past race day, results and certificate. */
const EMAILED_LINK_DAYS = 365;

/** How long the lookup's own token works: one sitting on the page. */
export const LOOKUP_TOKEN_MINUTES = 60;

/** Whose details a token may show: the whole order, or these runner numbers. */
export type TrackScope = { registrationId: string; runnerNos: number[] | null };

export async function createTrackToken(scope: TrackScope, expiresAt: Date): Promise<string> {
  return new SignJWT(scope.runnerNos ? { purpose: PURPOSE, runners: scope.runnerNos } : { purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(scope.registrationId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(SECRET_KEY);
}

/** The scope a token names, or null for a forged, expired or foreign one. */
export async function readTrackToken(token: string): Promise<TrackScope | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
    if (payload.purpose !== PURPOSE || typeof payload.sub !== 'string' || !payload.sub) return null;
    const runners = payload.runners;
    if (runners === undefined) return { registrationId: payload.sub, runnerNos: null };
    if (!Array.isArray(runners) || runners.length === 0 || !runners.every(n => Number.isInteger(n) && n > 0)) {
      return null;
    }
    return { registrationId: payload.sub, runnerNos: runners as number[] };
  } catch {
    return null;
  }
}

/**
 * The emailed link for a whole order, on its race's own site (the owner,
 * 2026-10-23): a client's race on the client's site, every other on the main
 * one, which is where the track page shows it (`trackHome`, lib/track.ts).
 * Built with no request, because the email is also sent from the PayMongo
 * webhook, so it rests on `SITE_URL` (lib/site-host.ts). The client is read
 * here rather than added to every caller's registration query.
 */
export async function emailedTrackUrl(
  registration: { id: string; event: { clientId: string | null } },
  now: Date = new Date(),
): Promise<string> {
  const expiresAt = new Date(now.getTime() + EMAILED_LINK_DAYS * 24 * 60 * 60 * 1000);
  const [token, client] = await Promise.all([
    createTrackToken({ registrationId: registration.id, runnerNos: null }, expiresAt),
    registration.event.clientId
      ? prisma.client.findUnique({ where: { id: registration.event.clientId }, select: { subdomain: true, status: true } })
      : null,
  ]);
  return `${eventOrigin({ client })}/track/${token}`;
}
