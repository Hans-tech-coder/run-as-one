import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import prisma from './db';
import {
  SITE_LABEL_HEADER,
  SITE_URL_HEADER,
  eventOrigin,
  mainOrigin,
  type SiteClientRef,
} from './site-host';

/**
 * Which client a public request is for (CLIENT_SUBDOMAIN_PLAN.md).
 *
 * `src/proxy.ts` reads the host and forwards its client label as
 * `x-rao-site`, having thrown away any the browser sent. This turns the label
 * into the client: a live one (anything but ARCHIVED) holding that subdomain,
 * or — for a label nobody holds, or an archived client's — a redirect to the
 * main site. On the main site it is null. A lens only (lib/site-host.ts): it
 * filters and brands public pages, and no permission reads it.
 *
 * `ensureEventHost` is the other half: an event page opened on the wrong host
 * is sent, path and query kept, to the one it belongs to. Always a 307, never a
 * 308, because an event's client can change and a cached permanent redirect
 * would keep runners on the old site.
 */

/** What a client's site shows: its name and branding. */
const SITE_CLIENT_SELECT = {
  id: true,
  name: true,
  subdomain: true,
  website: true,
  logoUrl: true,
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

/**
 * The client whose site this request is on, or null on the main site. One
 * database read per request (React `cache`), however many components ask.
 */
export const getSiteClient = cache(async (): Promise<SiteClient | null> => {
  const label = (await headers()).get(SITE_LABEL_HEADER);
  if (!label) return null;

  const client = await prisma.client.findFirst({
    where: { subdomain: label, status: { not: 'ARCHIVED' } },
    select: SITE_CLIENT_SELECT,
  });
  if (!client) redirect(mainOrigin(await requestUrl()));
  return client;
});

/**
 * Sends an event page to the host it belongs to, when this is not it. Call it
 * before rendering anything about the event. It does nothing when the proxy
 * did not see the request, rather than guess.
 */
export async function ensureEventHost(event: { client: SiteClientRef | null }): Promise<void> {
  const here = await requestUrl();
  if (!here) return;
  const origin = eventOrigin(event, here);
  if (origin !== here.origin) redirect(`${origin}${here.pathname}${here.search}`);
}
