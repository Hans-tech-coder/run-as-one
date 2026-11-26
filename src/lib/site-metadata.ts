import type { Metadata, ResolvingMetadata } from 'next';
import { SITE_NAME } from './site-contact';
import type { SiteClient } from './site-client';

/**
 * **What a site's pages say about themselves to a link preview and a browser
 * tab**: title, description, Open Graph card and tab icon, for the main site
 * (`site` null) or a client's (CLIENT_SUBDOMAIN_PLAN.md). One builder for the
 * three layouts that brand a page — the root (no site), `s/[site]` (the
 * param) and `RequestSiteLayout` (the proxy's header) — so they cannot drift.
 *
 * `metadataBase` is what turns `app/opengraph-image.png` into the absolute URL
 * a link preview needs: Messenger, Viber, Facebook, X and Slack all scrape
 * `og:image` and none of them will resolve a relative path. The favicon has
 * nothing to do with this — it is the browser tab only — so without a card
 * here a shared link showed no image at all. `openGraph` and `twitter` are
 * declared even though Next fills the image in on its own, because the title
 * and description a preview shows are otherwise the page title tag alone.
 *
 * On a client's site the base is the client's own host and the title carries
 * the client's name, so a shared link reads as that client's page
 * (lib/site-client.ts).
 *
 * The tab icon is declared here rather than by files in `app/`, because a file
 * there outranks anything `generateMetadata` says, and a client's site wears
 * its own square **site icon** (never its logo, which is rarely square and
 * would be stretched). Run As One's mark lives in `public/`; a client's site
 * with no site icon keeps it.
 */

/**
 * The main site's default, which is also the home page's: what a search for a
 * race in the Philippines should match — "fun run", "road race",
 * "Philippines", results, e-certificate — because the hero's headline names
 * only the provinces of the races on the calendar today.
 */
const TITLE = `${SITE_NAME} | Fun Runs & Road Races in the Philippines`;
const DESCRIPTION =
  'Register online for fun runs and road races in the Philippines. Find upcoming running events, look up your race results and download your e-certificate.';

const RAO_ICONS: Metadata['icons'] = {
  icon: [
    { url: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
    { url: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
  ],
  apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
};

type Card = NonNullable<NonNullable<Metadata['openGraph']>['images']>;

/**
 * The Run As One card (`app/opengraph-image.png`) for a layout below the root.
 * The file convention attaches it to the root segment alone, and a child that
 * says `openGraph` replaces its parent's whole, card included — so a child
 * passes the parent's on, as a path its own `metadataBase` makes absolute on
 * the site's own host.
 */
export async function rootCard(parent: ResolvingMetadata): Promise<Card> {
  const images = (await parent).openGraph?.images ?? [];
  return images.map(image => {
    const descriptor = typeof image === 'string' || image instanceof URL ? { url: image } : image;
    const url = new URL(descriptor.url, 'http://card.invalid');
    return { ...descriptor, url: `${url.pathname}${url.search}` };
  });
}

/** `card`: the parent's, from `rootCard`, in a layout below the root. */
export function siteMetadata(site: SiteClient | null, origin: string, card?: Card): Metadata {
  const title = site ? `${site.name} | Events & Results` : TITLE;
  const description = site
    ? `Register for ${site.name}'s races and look up your results. Powered by ${SITE_NAME}.`
    : DESCRIPTION;

  return {
    metadataBase: new URL(origin),
    icons: site?.faviconUrl ? { icon: site.faviconUrl, apple: site.faviconUrl } : RAO_ICONS,
    title,
    description,
    openGraph: {
      type: 'website',
      siteName: site?.name ?? SITE_NAME,
      title,
      description,
      url: origin,
      locale: 'en_PH',
      ...(card ? { images: card } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

/** A site's own listing pages: each says its own title and canonical URL. */
export type SitePage = 'home' | 'events' | 'results';

const MAIN_PAGE_COPY: Record<SitePage, { title: string; description: string }> = {
  home: { title: TITLE, description: DESCRIPTION },
  events: {
    title: `Upcoming Fun Runs & Road Races in the Philippines | ${SITE_NAME}`,
    description:
      "Running events in the Philippines open for registration. See each race's date, venue, distances and price, and register online in minutes.",
  },
  results: {
    title: `Race Results & E-Certificates | ${SITE_NAME}`,
    description:
      `Official results of running events in the Philippines held with ${SITE_NAME}. Find your time by name or bib number and download your e-certificate.`,
  },
};

function clientPageCopy(site: SiteClient, page: SitePage): { title: string; description: string } {
  if (page === 'results') {
    return {
      title: `Race Results | ${site.name}`,
      description: `Official results of ${site.name}'s races. Find your time by name or bib number and download your e-certificate. Powered by ${SITE_NAME}.`,
    };
  }
  // A client's `/` is a redirect to its `/events` (src/proxy.ts), so both say this.
  return {
    title: `Upcoming Races | ${site.name}`,
    description: `Register for ${site.name}'s upcoming races and look up your results. Powered by ${SITE_NAME}.`,
  };
}

/**
 * `siteMetadata` for one of a site's listing pages (`s/[site]`): its own
 * title and description instead of the layout's, and `alternates.canonical`
 * on the site's own origin, so `/events?view=past` and the bare `/events` are
 * one page to a search engine. `openGraph` and `twitter` are restated whole,
 * card included, since a child that names either replaces its parent's.
 */
export function sitePageMetadata(site: SiteClient | null, origin: string, page: SitePage, card?: Card): Metadata {
  const { title, description } = site ? clientPageCopy(site, page) : MAIN_PAGE_COPY[page];
  const url = page === 'home' ? origin : `${origin}/${page}`;
  const base = siteMetadata(site, origin, card);
  return {
    ...base,
    title,
    description,
    alternates: { canonical: url },
    openGraph: { ...base.openGraph, title, description, url },
    twitter: { ...base.twitter, title, description, ...(card ? { images: card } : {}) },
  };
}
