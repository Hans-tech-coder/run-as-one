import AdminRouteLoading from '../AdminRouteLoading';

/**
 * Covers moving within the Events section — the table to one event's Edit,
 * Registrants or Manage Results, New Event, and back to the table.
 *
 * `admin/loading.tsx` cannot: a fallback shows only when the segment directly
 * under it changes, and every one of those clicks keeps `events` as the
 * segment under `admin`. Without this file the events table sat on screen
 * unchanged while the next page loaded, with the action menu's small dots as
 * the only sign the click was heard. See AdminRouteLoading.
 */
export default function Loading() {
  return <AdminRouteLoading />;
}
