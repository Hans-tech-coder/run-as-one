import React from "react";
import RunnerLoader from "@/components/ui/RunnerLoader";

/**
 * What the public site shows while a page is being fetched: a loading screen
 * under the navbar, the running figure centred in it.
 *
 * Used by four `loading.tsx` files, two per section: `events/` and `results/`
 * catch arriving at a race, and `events/[slug]/` and `results/[slug]/` catch
 * moving within one — event page to wizard, winners board to leaderboard to a
 * runner's result. A fallback only shows when the segment directly under it
 * changes, which is why the section-level pair alone left those moves showing
 * the old page. `/` and the legal pages are prerendered and need none.
 *
 * Two layers (`.public-route-loading` in globals.css). The outer one is an
 * in-flow spacer a viewport tall, so the footer stays below the fold. The
 * stage inside is fixed to the viewport, so the figure is centred on screen
 * wherever the runner had scrolled to on the page they left — pressing
 * Register Now from the bottom of a long event page used to leave it above
 * the top of the screen. It fades in after 120ms, so a prefetched page never
 * flashes it, and its caption changes after five seconds so a slow
 * connection reads as slow rather than stuck.
 */
export default function PublicRouteLoading() {
  return (
    <div className="public-route-loading" aria-busy="true">
      <div className="public-route-loading__stage">
        <RunnerLoader
          size="lg"
          caption="Loading"
          slowCaption="Still loading, hang tight"
        />
      </div>
    </div>
  );
}
