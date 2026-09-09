import React from "react";
import LoadingDots from "@/components/ui/LoadingDots";

/**
 * What the dashboard shows while a page is being fetched.
 *
 * Every admin and superadmin page is built the same way — an `.admin-header`
 * with a title in it, then `.admin-content` — so the fallback is that same
 * frame with the answers still missing. Holding the header at its real 80px
 * and the content at a real height means the page that arrives fills the shape
 * already on screen instead of shunting it, which is the whole difference
 * between a wait that reads as progress and one that reads as a glitch.
 *
 * The title is a pulsing skeleton bar rather than the word "Loading", because
 * a title is the one thing about the next page whose shape is known: it is a
 * short line of text in a fixed spot. The dots below it are the part that says
 * the click was heard.
 *
 * Used by `admin/loading.tsx` and `superadmin/loading.tsx`, which is Next.js's
 * Suspense fallback for the segment and everything nested under it, so a slow
 * registrants table or results upload is covered by the same screen with
 * nothing to add per route.
 */
export default function AdminRouteLoading() {
  return (
    <>
      <header className="admin-header">
        <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
          <div className="t-skel-bar" style={{ width: "180px", height: "20px" }} />
        </div>
      </header>

      <div className="admin-content admin-route-loading">
        <LoadingDots size="lg" label="Loading this page" />
      </div>
    </>
  );
}
