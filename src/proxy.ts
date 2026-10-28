import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { isPublicAdminPath } from '@/lib/next-path';
import {
  MAIN_SITE,
  SITE_LABEL_HEADER,
  SITE_PATH_PREFIX,
  SITE_URL_HEADER,
  mainOrigin,
  parseSiteLabel,
} from '@/lib/site-host';

/**
 * The sign-in screen, remembering the page that was asked for. The sign-in
 * page reads `next` back through `safeNextPath` (lib/next-path.ts), so what
 * goes in here is only ever a suggestion.
 *
 * The public admin pages (lib/next-path.ts) are the ones somebody without a
 * session has to reach. The invitation link is one of them: the person opening
 * it has no account yet — or has one but is not signed in on this browser —
 * and the page itself proves who they are with the token in the link.
 */
function toSignIn(request: NextRequest) {
  const url = new URL('/admin/login', request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== '/admin') url.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

/** Whether `pathname` is the dashboard or anything beneath it. */
function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * Proves a session exists before any dashboard page renders; what the session
 * may open is each page's own `can()` check (lib/actor.ts).
 *
 * There is one dashboard (ADMIN_MERGE_PLAN.md, Batch 2). This used to split
 * sessions between two — a super admin sent to `/superadmin`, everyone else
 * kept out of it — and now sends nobody anywhere but the sign-in screen. The
 * old `/superadmin` addresses are permanent redirects in next.config.ts, which
 * run before this, so they never reach it.
 */
async function guardAdmin(request: NextRequest, forward: Headers) {
  const pathname = request.nextUrl.pathname;
  if (isPublicAdminPath(pathname)) {
    return NextResponse.next({ request: { headers: forward } });
  }

  const token = request.cookies.get('admin_token')?.value;
  if (!token) {
    return toSignIn(request);
  }

  try {
    const payload = await verifyToken(token);
    if (!payload) {
      return toSignIn(request);
    }
  } catch {
    return toSignIn(request);
  }

  return NextResponse.next({ request: { headers: forward } });
}

/**
 * The public pages that stay outside `src/app/s/[site]/` and learn their
 * site from the header: they read the live request (the register wizard,
 * `/pay`, `/track`) or have not been moved (PUBLIC_PAGE_CACHE_PLAN.md §2).
 * Every other page path goes to the site tree, so an address nobody serves
 * gets that site's own 404 there. **A new page outside the site tree has to
 * be added here**, or it is rewritten into the tree and 404s.
 */
const REQUEST_SITE_PAGE =
  /^\/(?:(?:pay|track|feedback|privacy|terms|coming-soon)(?:\/|$)|events\/[^/]+\/register(?:\/|$))/;

/**
 * The URL the browser asked for. `request.url` is not it everywhere: the dev
 * server writes its own `localhost:3000` there whatever the host, so the host
 * (and, behind Vercel's edge, the scheme) come from the request's headers.
 */
function publicUrl(request: NextRequest): URL {
  const url = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, request.url);
  const host = request.headers.get('host');
  if (host) url.host = host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  if (proto === 'http' || proto === 'https') url.protocol = `${proto}:`;
  return url;
}

/**
 * A 307 to another host. Next rewrites a redirect `Location` on the host it
 * believes it is serving into a bare path, which the browser then resolves on
 * the host it is actually on — so where the two differ (the dev server, which
 * thinks every request is for `localhost:3000`), `crc.localhost:3000/admin`
 * would be sent back to itself. There, and only there, the move is a refresh
 * page instead.
 */
function redirectToHost(target: URL, request: NextRequest) {
  if (target.host !== request.nextUrl.host) {
    return NextResponse.redirect(target, 307);
  }
  const href = target.href.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  return new NextResponse(
    `<!doctype html><meta http-equiv="refresh" content="0;url=${href}"><a href="${href}">Continue</a>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

/**
 * Every page request, for two jobs (CLIENT_SUBDOMAIN_PLAN.md §2).
 *
 * **Which site this is**, from the host's client label (lib/site-host.ts). A
 * public page is rewritten to `/s/<label or _main>` plus its path, so the
 * site is a route param its page can be cached under
 * (PUBLIC_PAGE_CACHE_PLAN.md); the browser's URL does not change. The pages in
 * `REQUEST_SITE_PAGE` and the dashboard get the label as `x-rao-site`, with
 * the URL as `x-rao-url` instead. Both are deleted from what the browser sent
 * first, so a visitor cannot pick a site by header. Nor by path: a browser's
 * own `/s/crc/events` is rewritten like any other path, to
 * `/s/<this site>/s/crc/events`, which is this site's 404.
 *
 * **The dashboard's session check**, unchanged, and reached only by `/admin`.
 * A public page never gets near it, or every page would ask for a sign-in.
 *
 * On a client's site, `/admin/**` goes to the main host **before** the session
 * check: `admin_token` is a host-only cookie, so there is never a session on a
 * subdomain, and checking first would put the sign-in form on the wrong host.
 * The public admin pages go too, because a reset or invite link has to finish
 * where the dashboard's cookie is read. A site's `/` is its `/events`. Both
 * redirects are 307 and keep the path and query.
 */
export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const here = publicUrl(request);
  const label = parseSiteLabel(here.host);

  if (label && isAdminPath(pathname)) {
    return redirectToHost(new URL(`${pathname}${search}`, mainOrigin(here)), request);
  }
  if (label && pathname === '/') {
    return NextResponse.redirect(new URL(`/events${search}`, request.url), 307);
  }

  const forward = new Headers(request.headers);
  forward.delete(SITE_LABEL_HEADER);
  forward.delete(SITE_URL_HEADER);

  if (!isAdminPath(pathname) && !REQUEST_SITE_PAGE.test(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = `${SITE_PATH_PREFIX}/${label ?? MAIN_SITE}${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(target, { request: { headers: forward } });
  }

  if (label) forward.set(SITE_LABEL_HEADER, label);
  forward.set(SITE_URL_HEADER, here.href);

  if (isAdminPath(pathname)) return guardAdmin(request, forward);
  return NextResponse.next({ request: { headers: forward } });
}

/**
 * `/admin/:path*` stays its own entry so the session check can never be lost
 * to the second pattern's exclusions. The second is every other page: not
 * `/api` (no page to brand; routes read their own host), not Next's own files,
 * and not a static file by its extension. Only real file extensions are
 * excluded, so a path with a dot in it (a slug, a bib) still gets its site.
 * `/s/:path*` is its own entry too, extensions and all, so the browser can
 * never reach the site tree directly (`/s/crc/events/x.json` would otherwise
 * slip past as a "static file").
 */
export const config = {
  matcher: [
    '/admin/:path*',
    '/s/:path*',
    '/((?!api/|_next/|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|json|txt|xml|webmanifest|css|js|map|woff2?|ttf|pdf)$).*)',
  ],
};
