import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Calendar, ChevronRight, Compass, Mail, Trophy } from 'lucide-react';
import { IconBadge, PageOrbs, StatusPanel } from '@/components/StatusPanel';
import { SUPPORT_MAILTO } from '@/lib/site-contact';

export const metadata: Metadata = {
  title: 'Page Not Found | RunAsOne',
  description:
    'That page is not here. Browse open running events, look up official race results, or get in touch.',
};

/**
 * What a runner sees at any address this app does not serve.
 *
 * Because it lives at the root of the app directory it catches both kinds of
 * miss: an unmatched URL, and the notFound() thrown by /events/[slug] when a
 * poster or a group-chat link points at an event that has been taken down.
 * Those are the two that matter — a race link outlives the race.
 *
 * It renders inside the root layout, so the navbar and footer come with it.
 * That is deliberate: the failure a dead link should produce is "wrong page",
 * not "wrong website", and the fastest way to say so is to keep the frame the
 * runner was already looking at and change only what is inside it.
 */
export default function NotFound() {
  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      <PageOrbs />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center">
        <StatusPanel>
          <div className="flex flex-col items-center text-center">
            <IconBadge>
              <Compass size={30} aria-hidden="true" />
            </IconBadge>

            {/* The numeral is the fastest way to say which failure this is, so
                it is set as display type rather than buried in a sentence. */}
            <p
              aria-hidden="true"
              className="mt-6 mb-1 bg-gradient-to-r from-accent-orange to-accent-blue bg-clip-text text-[4.5rem] font-black leading-none tracking-tighter text-transparent sm:text-[7rem]"
            >
              404
            </p>
            <p className="mb-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">
              Page Not Found
            </p>

            <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
              You&apos;ve Gone Off Course
            </h1>
            <p className="m-0 max-w-md text-base leading-relaxed text-secondary">
              This page isn&apos;t here. The link may be an old one, the event
              may have been taken down by its organizer, or the address may have
              a typo in it.
            </p>
          </div>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/events"
              className="btn-gradient group w-full shrink-0 justify-center whitespace-nowrap rounded-[16px] px-8 py-4 text-center text-base no-underline shadow-xl shadow-accent-orange/20 sm:w-auto"
            >
              <span>Browse Events</span>
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="shrink-0 transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              href="/"
              className="flex min-h-[48px] w-full shrink-0 items-center justify-center whitespace-nowrap rounded-[16px] border border-white/10 bg-white/[0.04] px-8 py-4 text-center font-sans text-base font-bold uppercase tracking-[0.05em] text-white no-underline transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.08] sm:w-auto"
            >
              Back to Home
            </Link>
          </div>
        </StatusPanel>

        <p className="mb-4 mt-10 text-xs font-bold uppercase tracking-widest text-secondary">
          Or pick up from here
        </p>
        <ul className="m-0 grid w-full list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
          {DESTINATIONS.map(destination => (
            <li key={destination.label}>
              <DestinationCard {...destination} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const DESTINATIONS = [
  {
    label: 'Upcoming Events',
    body: 'Every race and fun run open for registration.',
    href: '/events',
    icon: Calendar,
  },
  {
    label: 'Race Results',
    body: 'Official times, rankings and e-certificates.',
    href: '/results',
    icon: Trophy,
  },
  {
    label: 'Contact Us',
    body: 'Tell us which link sent you here.',
    href: SUPPORT_MAILTO,
    icon: Mail,
    external: true,
  },
] as const;

function DestinationCard({
  label,
  body,
  href,
  icon: Icon,
  external,
}: {
  label: string;
  body: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  external?: boolean;
}) {
  const className =
    'group flex h-full flex-col gap-2 rounded-[16px] border border-white/[0.05] bg-black/40 p-4 no-underline transition-colors duration-200 hover:border-white/15 hover:bg-black/60';

  const inner = (
    <>
      <span className="flex items-center gap-2 text-sm font-bold text-white">
        <Icon size={16} aria-hidden={true} className="shrink-0 text-accent-orange" />
        {label}
      </span>
      <span className="text-sm leading-relaxed text-secondary">{body}</span>
    </>
  );

  if (external) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
