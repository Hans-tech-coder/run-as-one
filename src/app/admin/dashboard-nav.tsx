"use client";

import { createContext, useContext } from 'react';
import type { SignedInUser } from '@/lib/signed-in-user';

/**
 * Which screens the signed-in person has, for client code under the dashboard
 * frame that is not handed the user — today `admin/loading.tsx`.
 *
 * The Overview draws a fourth tile, *Platform Fees Collected*, only for
 * `platform:manage`, and a route fallback cannot import the page it waits for
 * nor read the session. So `AdminShell`, which the layout already gives the
 * user, passes the sidebar's own flags down, and the skeleton draws the tile
 * count the page will arrive with. Null while signed out, where no dashboard
 * page renders anyway.
 */
const DashboardNavContext = createContext<SignedInUser['nav'] | null>(null);

export const DashboardNavProvider = DashboardNavContext.Provider;

export function useDashboardNav() {
  return useContext(DashboardNavContext);
}
