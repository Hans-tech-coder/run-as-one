import { SITE_URL } from './site-contact';

/**
 * Which host is which (CLIENT_SUBDOMAIN_PLAN.md).
 *
 * `runasone.ph` is the main site. `<label>.runasone.ph` is one client's site,
 * the label being `Client.subdomain`. In development the root is `localhost`,
 * so `crc.localhost:3000` is CRC's site with no setup (browsers resolve
 * `*.localhost`). Any other host — a `*.vercel.app` preview — is the main site
 * only: it has no subdomains to send anybody to.
 *
 * **The host is a lens, never a permission.** It changes which events a public
 * page lists and whose logo it wears. Nothing that decides who may do what
 * reads it, and the admin lives on the main host alone.
 *
 * Which root an absolute link is built on follows `inviteOrigin`'s rule
 * (lib/team-invite.ts): `SITE_URL` in production, the request's own origin
 * everywhere else — so a link made on `local-dev` or a preview comes back to
 * the database it was written into. A caller with no request (an email sent
 * from a webhook) gets `SITE_URL`; a page that may not read its request gets
 * `deploymentOrigin()`, the same answer from the environment.
 *
 * No database here: `src/proxy.ts` imports it. Which client a request is for
 * is lib/site-client.ts.
 */

/**
 * The public pages that can be cached per site (PUBLIC_PAGE_CACHE_PLAN.md) are
 * not told their site by a header: the proxy rewrites them to
 * `/s/<site>/<path>`, served by `src/app/s/[site]/`, where `<site>` is the
 * client label or `MAIN_SITE`. The browser's URL never shows it, and a browser
 * that asks for `/s/…` itself gets a 404, so nobody picks a site by path.
 * `_main` can never be a label: a subdomain has no underscore.
 */
export const SITE_PATH_PREFIX = '/s';
export const MAIN_SITE = '_main';

/**
 * Every other page (the register wizard, `/pay`, `/track`, the 404) still
 * learns its site from the proxy: the client label as `x-rao-site` and the URL
 * the request was made for as `x-rao-url`. The proxy strips both from what the
 * browser sent before setting its own, so nothing downstream ever reads a value
 * a visitor wrote.
 */
export const SITE_LABEL_HEADER = 'x-rao-site';
export const SITE_URL_HEADER = 'x-rao-url';

/** A DNS label: lowercase letters, digits and inner hyphens, at most 30. */
export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
export const MAX_SUBDOMAIN = 30;

/** Labels no client may take: hosts the platform has, or may want. */
export const RESERVED_SUBDOMAINS: readonly string[] = [
  'www',
  'admin',
  'api',
  'app',
  'mail',
  'dev',
  'staging',
  'preview',
  'static',
  'assets',
];

const SITE_ROOT = new URL(SITE_URL).hostname.toLowerCase();
const DEV_ROOT = 'localhost';
/**
 * The hosts a client label can sit on. A preview that names itself in
 * `NEXT_PUBLIC_SITE_URL` is left out: Vercel serves no `crc.<preview>.vercel.app`.
 */
const ROOTS = [SITE_ROOT, DEV_ROOT].filter(root => !root.endsWith('.vercel.app'));

/** `Crc.RunAsOne.ph:443.` → `crc.runasone.ph`. An IPv6 literal has no label. */
function hostnameOf(host: string): string {
  const lower = host.trim().toLowerCase();
  if (lower.startsWith('[')) return lower;
  return lower.replace(/:\d+$/, '').replace(/\.$/, '');
}

/**
 * The client label in a hostname, or null for the main site.
 *
 * `crc.runasone.ph` and `crc.localhost:3000` give `"crc"`; `runasone.ph`,
 * `www.runasone.ph`, `localhost` and any `*.vercel.app` give null, as does a
 * name two labels deep (`a.b.runasone.ph`), which no client can have. Any other
 * single label comes back as it is, even one no client holds: the app answers
 * an unknown site by sending it to the main one (lib/site-client.ts).
 */
export function parseSiteLabel(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = hostnameOf(host);
  for (const root of ROOTS) {
    if (!hostname.endsWith(`.${root}`)) continue;
    const label = hostname.slice(0, -(root.length + 1));
    if (!label || label.includes('.') || label === 'www') return null;
    return label;
  }
  return null;
}

/**
 * What is wrong with a subdomain typed on /admin/clients, or null when it will
 * do. Empty is fine: it takes the client's site down.
 */
export function subdomainError(value: string): string | null {
  const label = value.trim().toLowerCase();
  if (!label) return null;
  if (label.length > MAX_SUBDOMAIN) {
    return `A subdomain is at most ${MAX_SUBDOMAIN} characters.`;
  }
  if (!SUBDOMAIN_PATTERN.test(label)) {
    return 'Use lowercase letters, numbers and hyphens only, not starting or ending with a hyphen, like crc or race-core.';
  }
  if (RESERVED_SUBDOMAINS.includes(label)) {
    return `"${label}" is reserved for Run As One. Choose another.`;
  }
  return null;
}

/**
 * This deployment's main origin from the environment alone, for a page that
 * cannot read its request (the `s/[site]` pages): `SITE_URL` in production,
 * the branch's own `*.vercel.app` host on a preview, `http://localhost:<port>`
 * in development. Passed as `requestUrl` below, it gives the origins a request
 * on that deployment's own host would.
 */
export function deploymentOrigin(): string {
  if (process.env.VERCEL_ENV === 'production') return new URL(SITE_URL).origin;
  const vercelHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

/** The main site's origin, as seen from `requestUrl` (see the header). */
export function mainOrigin(requestUrl?: string | URL | null): string {
  if (!requestUrl || process.env.VERCEL_ENV === 'production') {
    return new URL(SITE_URL).origin;
  }
  const url = new URL(requestUrl);
  const label = parseSiteLabel(url.host);
  if (label) url.hostname = url.hostname.slice(label.length + 1);
  return url.origin;
}

/**
 * A client site's origin, `https://crc.runasone.ph`. On a host that has no
 * subdomains (a preview) it is the main origin, since that is the only place
 * the client's pages can be shown there.
 */
export function clientOrigin(subdomain: string, requestUrl?: string | URL | null): string {
  const url = new URL(mainOrigin(requestUrl));
  if (!ROOTS.includes(url.hostname)) return url.origin;
  url.hostname = `${subdomain}.${url.hostname}`;
  return url.origin;
}

/** Enough of a client to know whether it has a site. */
export interface SiteClientRef {
  subdomain: string | null;
  status: string;
}

/**
 * The label a client's pages live under, or null when they live on the main
 * site: no subdomain set, or the client is archived (lib/client.ts), whose site
 * is down so its events fall back to the main host rather than to a dead one.
 */
export function siteLabelOf(client: SiteClientRef | null | undefined): string | null {
  if (!client?.subdomain || client.status === 'ARCHIVED') return null;
  return client.subdomain;
}

/**
 * The URL a route handler was called on, read as the proxy reads a page's
 * (`publicUrl` in src/proxy.ts): from the `Host` header rather than
 * `request.url`, which the dev server reports as `localhost:3000` whatever the
 * host, and because the proxy does not run for `/api`, so a route reads its
 * own. A lens like every host here, never a permission (`api/track` reads it
 * to send a lookup to its race's own site).
 */
export function requestPublicUrl(request: Request): URL {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (host) url.host = host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  if (proto === 'http' || proto === 'https') url.protocol = `${proto}:`;
  return url;
}

/**
 * Where an event's pages belong: its client's site when the client has one,
 * otherwise the main site.
 */
export function eventOrigin(
  event: { client: SiteClientRef | null },
  requestUrl?: string | URL | null,
): string {
  const label = siteLabelOf(event.client);
  return label ? clientOrigin(label, requestUrl) : mainOrigin(requestUrl);
}
