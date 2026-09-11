import PublicRouteLoading from "@/components/PublicRouteLoading";

/**
 * The same fallback as `events/loading.tsx`, one level down. That one is
 * keyed on the race, so it only shows when the race changes — going from a
 * race's page to its registration wizard stays inside the same race and would
 * leave the event page sitting there. This boundary is keyed on what is under
 * the race, so that move gets the running figure too.
 */
export default function Loading() {
  return <PublicRouteLoading />;
}
