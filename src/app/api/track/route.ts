import { NextResponse } from 'next/server';
import { TRACK_LOOKUP_RULE, TRACK_REF_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { findTrackScope, readTrackView, trackHome } from '@/lib/track';
import { TRACK_NOT_FOUND, readTrackRef, trackInputErrors } from '@/lib/track-input';
import { LOOKUP_TOKEN_MINUTES, createTrackToken } from '@/lib/track-link';
import { SITE_NAME } from '@/lib/site-contact';
import { eventOrigin, parseSiteLabel, requestPublicUrl } from '@/lib/site-host';

/**
 * Track My Registration's lookup (TRACK_PAGE_PLAN.md D1, §4, §5): a reference
 * and an email in, the masked view of what they open out.
 *
 * **POST, never GET.** The reference and the email ride in the body, so neither
 * lands in a browser history, a proxy log or a `Referer` header.
 *
 * **One answer for every miss.** A reference with no order, a removed order,
 * the wrong email and another runner's email all return the same 404 and the
 * same sentence (`TRACK_NOT_FOUND`), so a guesser learns nothing about which
 * half was wrong. Only a reference or an email that cannot be one at all is
 * named back, on its field, because that says nothing about any order.
 *
 * **On the race's own site.** A client's race is tracked on the client's site
 * and every other on the main one, as `/pay/[token]` is: a match asked on the
 * wrong site answers `{ elsewhere }` — the event, the site's name and a link
 * there — instead of the order under another organizer's branding.
 *
 * Throttled twice, before the database is touched: per address
 * (`TRACK_LOOKUP_RULE`) and per reference as typed (`TRACK_REF_RULE`). Every
 * response is `no-store`: what it carries is somebody's registration.
 */

// Somebody's registration: no browser, proxy or CDN keeps a copy.
const NO_STORE = { 'Cache-Control': 'no-store' };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!allowRequest('track', callerKey(request), TRACK_LOOKUP_RULE)) {
    return reply({ error: 'Too many lookups from your connection. Wait a minute, then try again.' }, 429);
  }

  let body: { ref?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply({ error: 'Enter your reference and email, then press Track.' }, 400);
  }

  const errors = trackInputErrors(body.ref, body.email);
  if (errors) return reply({ errors }, 400);

  const ref = readTrackRef(body.ref as string)!;
  if (!allowRequest('track-ref', ref.orderRef, TRACK_REF_RULE)) {
    return reply({ error: 'This reference was looked up many times in the last few minutes. Wait ten minutes, then try again.' }, 429);
  }

  const scope = await findTrackScope(ref, (body.email as string).trim());
  const home = scope ? await trackHome(scope.registrationId) : null;
  if (!scope || !home) return reply({ error: TRACK_NOT_FOUND }, 404);

  // An order is tracked on its race's own site (`trackHome`). Asked on another,
  // the answer is where to open it, with a link that needs no retyping: the
  // same short-lived token Resend uses, scoped as this lookup proved.
  const here = requestPublicUrl(request);
  if (home.label !== parseSiteLabel(here.host)) {
    const token = await createTrackToken(scope, new Date(Date.now() + LOOKUP_TOKEN_MINUTES * 60_000));
    return reply({
      elsewhere: {
        url: `${eventOrigin(home.event, here)}/track/${token}`,
        siteName: home.siteName ?? SITE_NAME,
        eventTitle: home.event.title,
      },
    });
  }

  const view = await readTrackView(scope, here.href);
  if (!view) return reply({ error: TRACK_NOT_FOUND }, 404);
  return reply({ view });
}
