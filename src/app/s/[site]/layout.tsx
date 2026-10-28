import type { Metadata, ResolvingMetadata } from "next";
import { findSiteClient, siteOrigin } from "@/lib/site-client";
import { rootCard, siteMetadata } from "@/lib/site-metadata";
import SiteFrame from "../../SiteFrame";

/**
 * The public pages that can be cached per site (PUBLIC_PAGE_CACHE_PLAN.md):
 * the home page, the event listing and pages, and the results. `src/proxy.ts`
 * rewrites `crc.runasone.ph/events` to `/s/crc/events` (`_main` on the main
 * site), so the site is `params.site` and nothing here reads a request API.
 * The browser's URL never shows the prefix.
 *
 * A label no live client holds is branded as the main site here, because a
 * layout cannot see the path to redirect to; the page under it redirects
 * (lib/site-client.ts).
 */
type SiteLayoutProps = { children: React.ReactNode; params: Promise<{ site: string }> };

export async function generateMetadata(
  { params }: Pick<SiteLayoutProps, "params">,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { site } = await params;
  return siteMetadata(await findSiteClient(site), siteOrigin(site), await rootCard(parent));
}

export default async function SiteLayout({ children, params }: SiteLayoutProps) {
  const { site } = await params;
  return <SiteFrame site={await findSiteClient(site)}>{children}</SiteFrame>;
}
