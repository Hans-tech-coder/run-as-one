"use client";

import { usePathname } from 'next/navigation';
import AdminRouteLoading from '../AdminRouteLoading';
import { routeShape } from '../route-loading-shape';

/**
 * Covers moving within the Events section — the table to one event's Edit,
 * Registrants or Manage Results, New Event, and back to the table.
 *
 * `admin/loading.tsx` cannot: a fallback shows only when the segment directly
 * under it changes, and every one of those clicks keeps `events` as the
 * segment under `admin`. Without this file the events table sat on screen
 * unchanged while the next page loaded, with the action menu's small dots as
 * the only sign the click was heard. See AdminRouteLoading.
 *
 * **Below `lg` it draws the shape of the page it is headed for** — the card
 * list for the table, registrants and results, form panels for New and Edit.
 * A fallback cannot know where it is headed from the file tree, since this one
 * boundary covers the list and every page under it, but it can ask the URL,
 * which a navigation with a loading boundary commits straight away. The shapes
 * live in route-loading-shape.ts beside every other route's.
 */
export default function Loading() {
  return <AdminRouteLoading shape={routeShape(usePathname())} />;
}
