import React from 'react';
import Link from 'next/link';
import { Compass } from 'lucide-react';

/**
 * The 404 an organizer or a super admin sees, wearing the admin chrome.
 *
 * The public 404 at src/app/not-found.tsx cannot do this job. It is built for
 * the root layout's navbar and footer, and ClientLayoutWrapper strips both of
 * those on any /admin or /superadmin path — so rendering it here produced a
 * page with no frame at all, flush against the viewport edges and looking
 * broken rather than merely missing.
 *
 * This one is made of the classes every other admin screen is made of, so a
 * wrong address looks like a page of this app that happens to be empty, and
 * the sidebar the reader arrived with is still there to leave by.
 */
export default function AdminNotFound({
  homeHref,
  homeLabel,
}: {
  homeHref: string;
  homeLabel: string;
}) {
  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">Page Not Found</h1>
      </header>

      <div className="admin-content">
        <div className="admin-panel">
          <div className="empty-state">
            <Compass size={48} className="empty-icon" aria-hidden="true" />

            <div>
              <p className="mb-2 text-lg font-bold text-white">
                There is nothing at this address
              </p>
              {/* No mention of the sidebar: on a phone it is behind the menu
                  button, and a 404 is the wrong moment to describe furniture
                  the reader cannot see. */}
              <p className="m-0 max-w-md text-sm leading-relaxed">
                The link may be an old one, or the record it pointed at may have
                been deleted. Nothing else has moved — carry on from your
                dashboard.
              </p>
            </div>

            <Link
              href={homeHref}
              className="btn-gradient mt-2 px-8 py-3 no-underline"
            >
              {homeLabel}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
