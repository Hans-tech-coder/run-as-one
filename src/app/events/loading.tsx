import PublicRouteLoading from "@/components/PublicRouteLoading";
import { EventsTabsWhileLoading } from "./EventsTabs";

/**
 * Covers /events, one race's page and its registration wizard, so a click on
 * Register Now is answered by the running figure instead of a page that sits
 * still. See PublicRouteLoading.
 *
 * A switch between the Upcoming and Past tabs is a navigation too, and lands
 * here; the tab row stays drawn above the figure so the switch does not
 * vanish under the finger that pressed it. It draws only for /events itself.
 */
export default function Loading() {
  return (
    <>
      <EventsTabsWhileLoading />
      <PublicRouteLoading />
    </>
  );
}
