import PublicRouteLoading from "@/components/PublicRouteLoading";

/**
 * Covers /events, one race's page and its registration wizard, so a click on
 * Register Now is answered by the running figure instead of a page that sits
 * still. See PublicRouteLoading.
 */
export default function Loading() {
  return <PublicRouteLoading />;
}
