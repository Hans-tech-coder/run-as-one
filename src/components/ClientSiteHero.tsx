import React from 'react';
import type { SiteClient } from '@/lib/site-client';

/**
 * The head of a client site's `/events` (CLIENT_SUBDOMAIN_PLAN.md D8): the
 * headline, tagline and hero image saved under /admin/clients › Site &
 * branding, in the Paper look (docs/conventions.md §9).
 *
 * Words above the picture, never on it: the client's headline in type, and
 * their photograph under it at full content width. The old banner laid white
 * capitals over the photo behind a dark scrim, which is the poster-clutter
 * the public redesign removed everywhere else.
 *
 * Shown only when there is a hero image or a headline. An image saved without
 * a headline carries the client's name instead, so the head never stands
 * there with nothing in it.
 */
export function hasClientHero(site: SiteClient): boolean {
  return Boolean(site.heroImageUrl || site.heroHeadline);
}

export default function ClientSiteHero({ site }: { site: SiteClient }) {
  return (
    <section className="site-wrap pt-8 pb-4 sm:pt-12 md:pt-14" aria-labelledby="client-hero">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-end lg:gap-8" data-enter>
        <h1 id="client-hero" className="site-h1 break-words lg:col-span-7">
          {site.heroHeadline || site.name}
        </h1>
        {site.heroTagline && (
          <p className="site-lead lg:col-span-5">{site.heroTagline}</p>
        )}
      </div>
      {site.heroImageUrl && (
        <div className="mt-8 overflow-hidden rounded-[14px] bg-site-surface md:mt-10" data-enter>
          {/* The client's photograph, cropped to one band across the page; it
              is a picture of their runners, not a poster with words to keep. */}
          <img src={site.heroImageUrl} alt="" className="block aspect-[16/9] w-full object-cover sm:aspect-[21/9]" />
        </div>
      )}
    </section>
  );
}
