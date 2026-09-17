import React from 'react';
import Link from 'next/link';
import { Compass } from 'lucide-react';

/**
 * The 404 anyone signed in to the dashboard sees, wearing the admin chrome.
 *
 * The public 404 at src/app/not-found.tsx cannot do this job. It is built for
 * the root layout's navbar and footer, and ClientLayoutWrapper strips both of
 * those on any /admin path — so rendering it here produced a
 * page with no frame at all, flush against the viewport edges and looking
 * broken rather than merely missing.
 *
 * This one is made of the classes every other admin screen is made of, so a
 * wrong address looks like a page of this app that happens to be empty, and
 * the sidebar the reader arrived with is still there to leave by.
 *
 * The words can be swapped for a page that misses one record rather than a
 * whole address: the registrants and results screens answer an event that is
 * missing, or not this person's, with it. Both misses must read identically
 * (PROJECT_GUIDE §7), so a caller passes one fixed wording and never a reason.
 */
export default function AdminNotFound({
  homeHref,
  homeLabel,
  title = 'Page Not Found',
  heading = 'There is nothing at this address',
  body = 'The link may be an old one, or the record it pointed at may have been deleted. Nothing else has moved — carry on from your dashboard.',
}: {
  homeHref: string;
  homeLabel: string;
  title?: string;
  heading?: string;
  body?: string;
}) {
  return (
    <>
      <header className="admin-header">
        <h1 className="admin-header-title">{title}</h1>
      </header>

      <div className="admin-content">
        <div className="admin-panel">
          <div className="empty-state">
            <Compass size={48} className="empty-icon" aria-hidden="true" />

            <div>
              <p className="mb-2 text-lg font-bold text-white">
                {heading}
              </p>
              {/* No mention of the sidebar: on a phone it is a rail of icons,
                  and a 404 is the wrong moment to describe furniture the
                  reader may not recognise. */}
              <p className="m-0 max-w-md text-sm leading-relaxed">
                {body}
              </p>
            </div>

            <Link
              href={homeHref}
              className="btn-light mt-2"
            >
              {homeLabel}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
