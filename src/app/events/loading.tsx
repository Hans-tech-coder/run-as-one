import PublicRouteLoading from "@/components/PublicRouteLoading";
import { EventsTabsWhileLoading } from "./EventsTabs";

/**
 * Covers /events, one race's page and its registration wizard, so a click on
 * Register Now is answered by the running figure instead of a page that sits
 * still. See PublicRouteLoading.
 *
 * A switch between the Upcoming and Past tabs does not land here: the page
 * holds both tabs and swaps them in place (EventsTabSwitch). Arriving at
 * /events does, and the tab row is drawn above the figure then, so the
 * switch is already where it will be. It draws only for /events itself.
 */
export default function Loading() {
  return (
    <>
      <EventsTabsWhileLoading />
      <PublicRouteLoading />
    </>
  );
}
