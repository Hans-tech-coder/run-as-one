"use client";

import { usePathname } from 'next/navigation';
import LoadingDots from '@/components/ui/LoadingDots';
import AdminRouteLoading from '../AdminRouteLoading';
import { AdminCardListSkeleton } from '../AdminCardList';

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
 * **Coming back to the list, below `lg`, it draws the list's shape.** The list
 * is cards there, several screens tall, and a centred row of dots in their
 * place made the page jump when they arrived. A fallback cannot know where it
 * is headed from the file tree, since this one boundary covers the list and
 * every page under it, but it can ask the URL, which a navigation with a
 * loading boundary commits straight away. Anywhere else under Events, and on
 * the desktop, it is the ordinary fallback.
 */
export default function Loading() {
  const pathname = usePathname();

  if (pathname !== '/admin/events') {
    return <AdminRouteLoading />;
  }

  return (
    <>
      <header className="admin-header">
        <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
          <div className="t-skel-bar" style={{ width: '180px', height: '20px' }} />
        </div>
      </header>

      <div className="admin-content">
        <div className="dash-desktop-only admin-route-loading">
          <LoadingDots size="lg" label="Loading this page" />
        </div>

        <div className="dash-mobile-only flex flex-col gap-4">
          <span className="sr-only" role="status">Loading events</span>
          {/* The toolbar's search row, at its real 40px. */}
          <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
            <div className="t-skel-bar" style={{ width: '100%', height: '40px' }} />
          </div>
          <AdminCardListSkeleton cards={3} fields={2} className="is-flush" />
        </div>
      </div>
    </>
  );
}
