import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { MAIN_SITE, parseSiteLabel } from '@/lib/site-host';
import { siteOrigin } from '@/lib/site-client';

/**
 * Crawlers are welcome on the listings, the event pages and the results — that
 * is how runners find a race and their own times — and kept off what only a
 * signed-in person, a runner mid-order or the app itself uses.
 *
 * Every page here is a database read, and Neon bills for the time its compute
 * is awake, so a crawler walking the dashboard's login, a checkout link or an
 * API route keeps the compute up for nothing (lib/public-db.ts). The register
 * wizard is left out for the same reason: it reads live, and its event page is
 * the one worth indexing.
 *
 * One page under `/admin` is let back in: the services inquiry,
 * `/admin/register` ("Our Services"), which is how an organizer looking for a
 * race registration service finds Run As One. Google follows the longest
 * matching rule, so its `allow` outranks the `/admin` disallow. It is a
 * cached read (lib/public-db.ts) and the dashboard layout above it reads no
 * database without a session cookie, so a crawl costs no wake-up.
 *
 * One file serves every host, client subdomains included (`src/proxy.ts`
 * leaves `.txt` alone), and each host's `Sitemap:` line must name that host's
 * own sitemap (app/sitemap.ts), so this reads the `Host` header. That makes it
 * dynamic, but it reads no database: it costs a function call, never a Neon
 * wake-up.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const label = parseSiteLabel((await headers()).get('host'));
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/admin/register'],
      disallow: ['/admin', '/api/', '/pay/', '/events/*/register', '/coming-soon'],
    },
    sitemap: `${siteOrigin(label ?? MAIN_SITE)}/sitemap.xml`,
  };
}
