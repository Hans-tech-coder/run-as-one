import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import publicDb, { publishCutoff } from './public-db';
import { eventByParam } from './event-slug';
import { publishedEvents } from './event-visibility';
import {
  MAIN_SITE,
  SITE_LABEL_HEADER,
  SITE_URL_HEADER,
  clientOrigin,
  deploymentOrigin,
  eventOrigin,
  mainOrigin,
  type SiteClientRef,
} from './site-host';

/**
 * Which client a public request is for (CLIENT_SUBDOMAIN_PLAN.md).
 *
 * `src/proxy.ts` reads the host and hands the app its client label one of two
 * ways (lib/site-host.ts). The pages under `src/app/s/[site]/` get it as
 * the route param `site` (`MAIN_SITE` on the main site) and read no request
 * API, so they can later be cached per site (PUBLIC_PAGE_CACHE_PLAN.md); their
 * origins come from `deploymentOrigin()`. Every other page gets it as the
 * `x-rao-site` header, with `x-rao-url`, and uses the `request*` functions.
 *
 * Either way the label becomes the client: a live one (anything but ARCHIVED)
 * holding that subdomain, or — for a label nobody holds, or an archived
 * client's — a redirect to the main site. On the main site it is null. A lens
 * only (lib/site-host.ts): it filters and brands public pages, and no
 * permission reads it.
 *
 * `ensureEventSite` / `ensureEventHost` are the other half: an event page
 * opened on the wrong host is sent, path kept, to the one it belongs to.
 * Always a 307, never a 308, because an event's client can change and a cached
 * permanent redirect would keep runners on the old site.
 */

/** What a client's site shows: its name and branding. */
const SITE_CLIENT_SELECT = {
  id: true,
  name: true,
  subdomain: true,
  website: true,
  logoUrl: true,
  faviconUrl: true,
  heroImageUrl: true,
  heroHeadline: true,
  heroTagline: true,
  publicEmail: true,
  publicPhone: true,
  facebookUrl: true,
  instagramUrl: true,
  tiktokUrl: true,
  youtubeUrl: true,
} as const;

export interface SiteClient {
  id: string;
  name: string;
  subdomain: string | null;
  website: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
  heroHeadline: string | null;
  heroTagline: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
}

/** The URL this request was made for, as the proxy recorded it. */
async function requestUrl(): Promise<URL | null> {
  const raw = (await headers()).get(SITE_URL_HEADER);
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** The live client holding `label`. One read per request (React `cache`). */
const clientWithLabel = cache(
  (label: string): Promise<SiteClient | null> =>
    publicDb.client.findFirst({
      where: { subdomain: label, status: { not: 'ARCHIVED' } },
      select: SITE_CLIENT_SELECT,
    }),
);

/**
 * The client a `s/[site]` page's `site` param names, or null on the main
 * site — and null, too, for a label no live client holds, because the
 * `[site]` layout that brands the page cannot see the path to redirect to.
 * The pages do that: `getSiteClient` and `ensureEventSite`.
 */
export async function findSiteClient(site: string): Promise<SiteClient | null> {
  return site === MAIN_SITE ? null : clientWithLabel(site);
}

/**
 * `findSiteClient` for a page that knows its own `path`: a label nobody holds,
 * or an archived client's, is sent to `path` on the main site, where an
 * archived client's races now live.
 */
export async function getSiteClient(site: string, path: string): Promise<SiteClient | null> {
  if (site === MAIN_SITE) return null;
  const client = await clientWithLabel(site);
  if (!client) redirect(`${mainOrigin(deploymentOrigin())}${path}`);
  return client;
}

/**
 * The origin a `site` param is served on: the client's subdomain, or the main
 * site, on this deployment (`deploymentOrigin`, site-host.ts). What
 * `metadataBase` is built on, so a link preview of a client's page names the
 * client's host.
 */
export function siteOrigin(site: string): string {
  const base = deploymentOrigin();
  return site === MAIN_SITE ? mainOrigin(base) : clientOrigin(site, base);
}

/**
 * Sends a `s/[site]` event page to the site its event belongs to, when this is
 * not it, at `path` (the page's own, as the browser asked for it). Call it
 * before rendering anything about the event. Origins are compared rather than
 * labels, so a preview, where every site is the main one, never loops. An
 * unknown label's origin matches no event's, so its event pages are sent on
 * from here too.
 */
export function ensureEventSite(event: { client: SiteClientRef | null }, site: string, path: string): void {
  const origin = eventOrigin(event, deploymentOrigin());
  if (origin !== siteOrigin(site)) redirect(`${origin}${path}`);
}

/**
 * Where a link to an event's page is built from, seen from `site`: the origin
 * of the site the event belongs to when that is not this one, else '' so the
 * link stays relative. A card on the main site then opens a client's race
 * straight on the client's site, without a redirect hop.
 */
export function eventLinkOrigin(site: string): (event: { client: SiteClientRef | null }) => string {
  const here = siteOrigin(site);
  return event => {
    const origin = eventOrigin(event, deploymentOrigin());
    return origin === here ? '' : origin;
  };
}

/**
 * The client whose site this request is on, from the proxy's `x-rao-site`, for
 * the pages outside `s/[site]` (the register wizard, `/pay`, `/track`, the
 * 404). Null on the main site; an unknown or archived label is redirected to
 * the main site, path and query kept.
 */
export const requestSiteClient = cache(async (): Promise<SiteClient | null> => {
  const label = (await headers()).get(SITE_LABEL_HEADER);
  if (!label) return null;

  const client = await clientWithLabel(label);
  if (!client) {
    // Path and query kept: an archived client's races now live on the main site.
    const here = await requestUrl();
    redirect(`${mainOrigin(here)}${here?.pathname ?? '/'}${here?.search ?? ''}`);
  }
  return client;
});

/** `siteOrigin` for a page outside `s/[site]`, from the request's own URL. */
export async function requestSiteOrigin(): Promise<string> {
  const [site, here] = await Promise.all([requestSiteClient(), requestUrl()]);
  return site?.subdomain ? clientOrigin(site.subdomain, here) : mainOrigin(here);
}

/**
 * `ensureEventSite` for a page outside `s/[site]` (the register wizard,
 * `/pay`, `/track`), from the URL the proxy recorded, query kept — the wizard
 * needs PayMongo's success flag and order reference to come along. It does
 * nothing when the proxy did not see the request, rather than guess.
 */
export async function ensureEventHost(event: { client: SiteClientRef | null }): Promise<void> {
  const here = await requestUrl();
  if (!here) return;
  const origin = eventOrigin(event, here);
  if (origin !== here.origin) redirect(`${origin}${here.pathname}${here.search}`);
}

/**
 * An event page's `alternates.canonical`: `path(slug)` on the site the event
 * belongs to, so a search engine sees one URL per page however many hosts
 * could reach it. Nothing for an event that does not exist; the page itself
 * answers that.
 */
export async function eventPageMetadata(
  param: string,
  path: (slug: string) => string,
): Promise<Metadata> {
  const event = await publicDb.event.findFirst({
    // An unpublished event has no public page to point search engines at.
    where: { AND: [eventByParam(param), publishedEvents(await publishCutoff())] },
    select: { slug: true, client: EVENT_SITE_CLIENT },
  });
  if (!event) return {};
  return { alternates: { canonical: `${eventOrigin(event, deploymentOrigin())}${path(event.slug)}` } };
}

/** The two client columns `eventOrigin` reads, for a Prisma `select`/`include`. */
export const EVENT_SITE_CLIENT = { select: { subdomain: true, status: true } } as const;
