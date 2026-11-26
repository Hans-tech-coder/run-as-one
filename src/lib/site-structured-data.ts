import type { SocialLinks } from './site-contact';
import { SITE_NAME } from './site-contact';

/**
 * **What the home page tells Google about Run As One itself**, as schema.org
 * `Organization` and `WebSite` JSON-LD: the name a search result shows over
 * the site's links, the logo beside it, and the social profiles that are the
 * same brand (`sameAs`). Event pages carry their own `SportsEvent` markup
 * (lib/event-structured-data.ts); this is the layer above it.
 *
 * The rule is the event markup's: only what is true and on the site. The
 * profiles are the ones saved at /admin/settings — the footer's links — and a
 * channel left empty there is left out here, and so is one that names only the
 * network's front page (`https://instagram.com`), which is no profile at all. The logo is `public/apple-icon.png`,
 * Run As One's square mark (180×180, above Google's 112px minimum).
 *
 * Main site only: a client's site is that client's, and its `/` is a
 * redirect anyway. Render it with `jsonLdScript` (lib/event-structured-data.ts),
 * which escapes the payload.
 */
function isProfile(url: string): boolean {
  try {
    const { pathname, search } = new URL(url);
    return pathname.replace(/\/+$/, '') !== '' || search !== '';
  } catch {
    return false;
  }
}

export function siteJsonLd(origin: string, socialLinks: SocialLinks, email: string) {
  const home = `${origin}/`;
  const organization = `${home}#organization`;
  const sameAs = Object.values(socialLinks).filter((url): url is string => url !== null && isProfile(url));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organization,
        name: SITE_NAME,
        url: home,
        logo: `${origin}/apple-icon.png`,
        email,
        areaServed: { '@type': 'Country', name: 'Philippines' },
        ...(sameAs.length > 0 ? { sameAs } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        name: SITE_NAME,
        url: home,
        inLanguage: 'en-PH',
        publisher: { '@id': organization },
      },
    ],
  };
}
