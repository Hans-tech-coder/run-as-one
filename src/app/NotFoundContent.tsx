import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { SITE_NAME, supportMailto } from '@/lib/site-contact';
import { getContactEmail } from '@/lib/site-settings';

export const NOT_FOUND_METADATA: Metadata = {
  title: `Page Not Found | ${SITE_NAME}`,
  description:
    'That page is not here. Browse open running events, look up official race results, or get in touch.',
};

/**
 * What a runner sees at any address this app does not serve.
 *
 * It answers both kinds of miss: an unmatched URL, and the notFound()
 * thrown by /events/[slug] when a
 * poster or a group-chat link points at an event that has been taken down.
 * Those are the two that matter — a race link outlives the race.
 *
 * It renders inside the site's frame, so the navbar and footer come with it.
 * That is deliberate: the failure a dead link should produce is "wrong page",
 * not "wrong website", and the fastest way to say so is to keep the frame the
 * runner was already looking at and change only what is inside it. The
 * `not-found.tsx` files show it inside a frame: a site's own (`s/[site]/`,
 * which almost every miss reaches), the register wizard's, and the root one.
 */
export default async function NotFoundContent() {
  const contactEmail = await getContactEmail();

  return (
    <section className="site-section site-wrap">
      <div className="site-notice" data-enter>
        <p className="site-notice__code">Error 404 · Page not found</p>
        <h1 className="site-h1">You&apos;ve gone off course</h1>
        <p className="site-lead max-w-[56ch]">
          This page isn&apos;t here. The link may be an old one, the event may
          have been taken down by its organizer, or the address may have a typo
          in it.
        </p>
        <div className="site-notice__actions">
          <Link href="/events" className="site-btn site-btn--action site-btn--block-sm">
            Browse events
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/" className="site-btn site-btn--quiet site-btn--block-sm">
            Back to home
          </Link>
        </div>
      </div>

      <h2 className="sr-only">Or pick up from here</h2>
      <ul className="site-notice__more">
        {destinations(contactEmail).map(destination => (
          <li key={destination.label}>
            <DestinationLink {...destination} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Built per request: the contact address is a platform setting. */
const destinations = (contactEmail: string) => [
  {
    label: 'Upcoming races',
    body: 'Every race and fun run open for registration.',
    href: '/events',
  },
  {
    label: 'Race results',
    body: 'Official times, rankings and e-certificates.',
    href: '/results',
  },
  {
    label: 'Contact us',
    body: 'Tell us which link sent you here.',
    href: supportMailto(contactEmail),
    external: true,
  },
] as const;

function DestinationLink({
  label,
  body,
  href,
  external,
}: {
  label: string;
  body: string;
  href: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <strong>
        {label}
        <ArrowRight size={16} aria-hidden="true" />
      </strong>
      <span>{body}</span>
    </>
  );

  return external ? <a href={href}>{inner}</a> : <Link href={href}>{inner}</Link>;
}
