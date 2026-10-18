import type { MetadataRoute } from 'next';

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
 * Static, so it is served from the build and costs no read itself. It names no
 * sitemap: the app has none, and this file is shared by every host, client
 * subdomains included.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/pay/', '/events/*/register', '/coming-soon'],
    },
  };
}
