import ClientLayoutWrapper from "./ClientLayoutWrapper";
// The Paper face, shared with the sign-in pages' frame (admin/AuthPaperFrame).
import { archivo } from "./archivo-font";
import ThemedFavicon from "@/components/ThemedFavicon";
import type { SiteClient } from "@/lib/site-client";
import "./site.css";
import "./checkout-paper.css";

/**
 * A public page's frame: the navbar and footer, wearing the client's branding
 * on a client's site (`site`, lib/site-client.ts) and Run As One's otherwise.
 * The layouts that know the site render it — `s/[site]/layout.tsx` from the
 * route param, `RequestSiteLayout` and the root `not-found.tsx` from the
 * proxy's header — so the root layout reads no request API.
 */
export default function SiteFrame({
  site,
  children,
}: {
  site: SiteClient | null;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* A client's site icon replaces the mark, so it is not swapped in. */}
      {!site?.faviconUrl && <ThemedFavicon />}
      <ClientLayoutWrapper site={site} fontClass={archivo.variable}>{children}</ClientLayoutWrapper>
    </>
  );
}
