import type { Metadata, ResolvingMetadata } from "next";
import { requestSiteClient, requestSiteOrigin } from "@/lib/site-client";
import { rootCard, siteMetadata } from "@/lib/site-metadata";
import SiteFrame from "./SiteFrame";

/**
 * The layout of a public page outside `s/[site]` — the register wizard,
 * `/pay`, `/track`, `/feedback`, `/privacy`, `/terms`, `/coming-soon` — which
 * learns its site from the proxy's `x-rao-site` header (lib/site-host.ts)
 * rather than a route param. Those pages read the live request anyway, so they
 * are never cached, and they stay where they are (PUBLIC_PAGE_CACHE_PLAN.md
 * §2). Each one's `layout.tsx` re-exports this; an unknown subdomain is sent
 * to the main site from inside `requestSiteClient`.
 */
export async function generateMetadata(_: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const [site, origin, card] = await Promise.all([requestSiteClient(), requestSiteOrigin(), rootCard(parent)]);
  return siteMetadata(site, origin, card);
}

export default async function RequestSiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame site={await requestSiteClient()}>{children}</SiteFrame>;
}
