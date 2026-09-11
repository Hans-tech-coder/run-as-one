import React from "react";
import RunnerLoader from "@/components/ui/RunnerLoader";

/**
 * What the public site shows while a page is being fetched — the running
 * figure, centred where the page will be, between the navbar and the footer
 * that stay put around it.
 *
 * Used by four `loading.tsx` files, two per section: `events/` and `results/`
 * catch arriving at a race, and `events/[slug]/` and `results/[slug]/` catch
 * moving within one — event page to wizard, winners board to leaderboard to a
 * runner's result. A fallback only shows when the segment directly under it
 * changes, which is why the section-level pair alone left those moves showing
 * the old page. `/` and the legal pages are prerendered and need none.
 *
 * It holds a real height so the footer does not jump up into the gap, and it
 * fades in only after 120ms (`.public-route-loading`), so a page that was
 * prefetched and lands at once never flashes it.
 */
export default function PublicRouteLoading() {
  return (
    <div className="public-route-loading">
      <RunnerLoader size="lg" caption="Loading" />
    </div>
  );
}
