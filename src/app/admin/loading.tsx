import AdminRouteLoading from './AdminRouteLoading';

/**
 * Covers /admin and every page nested under it — events, registrants,
 * results, marketing, settings — so a click anywhere in the organizer
 * dashboard is answered on the next frame. See AdminRouteLoading.
 */
export default function Loading() {
  return <AdminRouteLoading />;
}
