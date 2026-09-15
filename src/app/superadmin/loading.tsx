"use client";

import { usePathname } from 'next/navigation';
import AdminRouteLoading from '../admin/AdminRouteLoading';
import { routeShape } from '../admin/route-loading-shape';

/**
 * The superadmin section wears the organizer dashboard's chrome, so it waits
 * the same way, drawing each page's phone shape below `lg`. See
 * admin/AdminRouteLoading and admin/route-loading-shape.ts.
 */
export default function Loading() {
  return <AdminRouteLoading shape={routeShape(usePathname())} />;
}
