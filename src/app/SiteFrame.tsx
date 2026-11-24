import { ViewTransition } from "react";
import ClientLayoutWrapper from "./ClientLayoutWrapper";
// The Paper face, shared with the sign-in pages' frame (admin/AuthPaperFrame).
import { archivo } from "./archivo-font";
import type { SiteClient } from "@/lib/site-client";
import "./site.css";
import "./checkout-paper.css";

/**
 * A public page's frame: the navbar and footer, wearing the client's branding
 * on a client's site (`site`, lib/site-client.ts) and Run As One's otherwise.
 * The layouts that know the site render it — `s/[site]/layout.tsx` from the
 * route param, `RequestSiteLayout` and the root `not-found.tsx` from the
 * proxy's header — so the root layout reads no request API.
 *
 * The frame carries the page transition too (`site-page-in` / `-out`, the same
 * as `PageReveal`). Every layout draws its own frame, so moving between two
 * of them — /events to the register wizard, /track to /contact — replaces the
 * whole frame, and a `<ViewTransition>` only enters or leaves when nothing
 * drawn comes before it in what is replaced; the page's own `PageReveal`
 * sits under the frame's markup and stays still on such a move. Inside one
 * frame (the pages under `s/[site]`) this boundary persists and the page's
 * `PageReveal` does the work instead. The navbar is the same on both sides,
 * so it is pinned out of the fade (`.site-nav`, site.css).
 */
export default function SiteFrame({
  site,
  children,
}: {
  site: SiteClient | null;
  children: React.ReactNode;
}) {
  return (
    <ViewTransition enter="site-page-in" exit="site-page-out" default="none">
      <ClientLayoutWrapper site={site} fontClass={archivo.variable}>{children}</ClientLayoutWrapper>
    </ViewTransition>
  );
}
