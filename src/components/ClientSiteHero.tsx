import React from 'react';
import type { SiteClient } from '@/lib/site-client';
import '../app/events/[slug]/EventDetails.css';

/**
 * The banner over a client site's `/events` (CLIENT_SUBDOMAIN_PLAN.md D8):
 * the hero image, headline and tagline saved under /admin/clients › Site &
 * branding. It is the event page's poster banner (`.event-hero`), so the
 * client's front page and its race pages share one full-bleed shape.
 *
 * Shown only when there is a hero image or a headline. An image saved without
 * a headline carries the client's name instead, so the banner never sits there
 * with nothing on it.
 */
export function hasClientHero(site: SiteClient): boolean {
  return Boolean(site.heroImageUrl || site.heroHeadline);
}

export default function ClientSiteHero({ site }: { site: SiteClient }) {
  return (
    <section className="event-hero">
      <div className="event-hero-bg">
        {site.heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a public blob of any size, like the event poster
          <img src={site.heroImageUrl} alt="" />
        )}
        <div className="event-hero-overlay"></div>
      </div>
      <div className="container event-hero-content t-stagger is-shown">
        <h1 className="event-hero-title t-stagger-line t-stagger-line--1">
          {site.heroHeadline || site.name}
        </h1>
        {site.heroTagline && (
          <p className="m-0 max-w-2xl text-base sm:text-xl leading-relaxed text-white/90 t-stagger-line t-stagger-line--2">
            {site.heroTagline}
          </p>
        )}
      </div>
    </section>
  );
}
