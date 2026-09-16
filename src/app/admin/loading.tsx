"use client";

import { usePathname } from 'next/navigation';
import AdminRouteLoading from './AdminRouteLoading';
import AuthRouteLoading from './AuthRouteLoading';
import { isBarePath } from './bare-paths';
import { routeShape } from './route-loading-shape';

/**
 * Covers /admin and every page nested under it — events, registrants,
 * results, marketing, settings — so a click anywhere in the organizer
 * dashboard is answered on the next frame. See AdminRouteLoading.
 *
 * A client component only to read the URL, which it needs twice over. The
 * fallback draws the shape of the page it is waiting for
 * (route-loading-shape.ts), so the tiles, cards and fields that arrive land
 * where their skeletons already stood. And the sign-in pages sit under
 * `/admin` without being dashboard screens (bare-paths.ts), so they are
 * answered by the centred figure alone, with none of the frame.
 */
export default function Loading() {
  const pathname = usePathname();

  if (isBarePath(pathname)) return <AuthRouteLoading />;

  return <AdminRouteLoading shape={routeShape(pathname)} />;
}
