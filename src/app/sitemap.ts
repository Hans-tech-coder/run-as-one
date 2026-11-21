import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { unstable_cache } from 'next/cache';
import publicDb, { publishCutoff } from '@/lib/public-db';
import { publishedEvents } from '@/lib/event-visibility';
import { takesResults } from '@/lib/event-format';
import { hasFinished } from '@/lib/event-schedule';
import { MAIN_SITE, deploymentOrigin, eventOrigin, parseSiteLabel } from '@/lib/site-host';
import { EVENT_SITE_CLIENT, findSiteClient, siteOrigin } from '@/lib/site-client';

/**
 * `/sitemap.xml`: the public pages of the host it is asked on, so each site —
 * `runasone.ph` and every client's `<label>.runasone.ph` — hands a search
 * engine its own pages, each at its canonical URL (`eventOrigin`, the same one
 * `eventPageMetadata` names).
 *
 * **Why it reads the host.** `src/proxy.ts` leaves `.xml` files alone, so this
 * is one route for every host, not a page under `s/[site]`; and a metadata
 * sitemap is handed no route params anyway. The `Host` header is the only way
 * to tell `crc.runasone.ph/sitemap.xml` from the main one. A lens, never a
 * permission (lib/site-host.ts).
 *
 * **Why it costs no wake-up.** Reading the host makes the route dynamic, so
 * the list itself is cached per site for SITEMAP_SECONDS, and the reads under
 * it go through `publicDb`'s cache too. A crawler fetching this every hour
 * does not wake the Neon compute (lib/public-db.ts).
 *
 * What is listed, and what is not:
 * - Every published event's page, unless the page would only send the visitor
 *   on: a race that is over and has results redirects to them, and a
 *   results-only race has no event page (RESULTS_ONLY_EVENT_PLAN.md D1).
 * - `/results/<slug>` and its full ranking for every race with times up. One
 *   runner's own page is left out: those are found by searching a name, and a
 *   sitemap of thousands of names is not something the runners asked for.
 * - Drafts and scheduled events never (`publishedEvents`).
 * - The site's own pages: on the main site `/`, `/events`, `/results`,
 *   `/track`, `/privacy` and `/terms`; on a client's site `/events`,
 *   `/results` and `/track` (its `/` is a redirect to `/events`, and the
 *   policies are Run As One's, served the same on every host, so they belong
 *   to the main site's list alone).
 * - Nothing on a label no live client holds: every page there sends the
 *   visitor to the main site.
 */

/** Six hours: a new race reaching Google a few hours late costs nothing. */
const SITEMAP_SECONDS = 6 * 60 * 60;

const MAIN_PAGES = ['/', '/events', '/results', '/track', '/privacy', '/terms'];
const CLIENT_PAGES = ['/events', '/results', '/track'];

const siteEntries = unstable_cache(
  async (site: string): Promise<MetadataRoute.Sitemap> => {
    if (site !== MAIN_SITE && !(await findSiteClient(site))) return [];

    const origin = siteOrigin(site);
    const events = await publicDb.event.findMany({
      where: publishedEvents(await publishCutoff()),
      orderBy: { date: 'desc' },
      select: {
        slug: true,
        date: true,
        format: true,
        virtualEndDate: true,
        resultsOnly: true,
        updatedAt: true,
        client: EVENT_SITE_CLIENT,
        _count: { select: { raceResults: true } },
      },
    });

    const pages: MetadataRoute.Sitemap = (site === MAIN_SITE ? MAIN_PAGES : CLIENT_PAGES).map(path => ({
      url: `${origin}${path === '/' ? '' : path}`,
    }));

    for (const event of events) {
      if (eventOrigin(event, deploymentOrigin()) !== origin) continue;
      const slug = encodeURIComponent(event.slug);
      const lastModified = event.updatedAt.toISOString();
      // The event page's own rule (EventDetails.tsx): a virtual run never has results.
      const hasResults = takesResults(event) && event._count.raceResults > 0;
      const redirects = (hasFinished(event) || event.resultsOnly) && hasResults;
      if (!event.resultsOnly && !redirects) {
        pages.push({ url: `${origin}/events/${slug}`, lastModified });
      }
      if (hasResults) {
        pages.push({ url: `${origin}/results/${slug}`, lastModified });
        pages.push({ url: `${origin}/results/${slug}/full`, lastModified });
      }
    }
    return pages;
  },
  ['sitemap'],
  { revalidate: SITEMAP_SECONDS },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const label = parseSiteLabel((await headers()).get('host'));
  return siteEntries(label ?? MAIN_SITE);
}
