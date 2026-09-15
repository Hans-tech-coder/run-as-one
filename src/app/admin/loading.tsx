"use client";

import { usePathname } from 'next/navigation';
import AdminRouteLoading from './AdminRouteLoading';
import { routeShape } from './route-loading-shape';

/**
 * Covers /admin and every page nested under it — events, registrants,
 * results, marketing, settings — so a click anywhere in the organizer
 * dashboard is answered on the next frame. See AdminRouteLoading.
 *
 * A client component only to read the URL: below `lg` the fallback draws the
 * shape of the page it is waiting for (route-loading-shape.ts), so the tiles
 * and cards that arrive land where their skeletons already stood.
 */
export default function Loading() {
  return <AdminRouteLoading shape={routeShape(usePathname())} />;
}
