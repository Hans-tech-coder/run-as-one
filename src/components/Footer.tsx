"use client";

import React from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { BrandGlyph } from './BrandIcons';
import {
  CONTACT_EMAIL,
  SITE_NAME,
  SOCIAL_CHANNELS,
  SUPPORT_MAILTO,
  socialChannelHref,
} from '@/lib/site-contact';

/**
 * Every destination in the footer, and nothing that does not exist.
 *
 * The columns this replaced advertised marathons, pricing, resources and an
 * FAQ that were never built, so a runner who trusted the footer landed on a
 * 404 — the worst possible moment on a page whose job is to look like the site
 * can be trusted with a payment. Each href below resolves to a real route, a
 * real mail client, or the coming-soon page that says so plainly.
 */
type FooterLink = { label: string; href: string; external?: boolean };

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Explore',
    links: [
      { label: 'Home', href: '/' },
      { label: 'Browse Events', href: '/events' },
      { label: 'Race Results', href: '/results' },
    ],
  },
  {
    heading: 'Organizers',
    links: [
      { label: 'Host an Event', href: '/admin/register' },
      { label: 'Organizer Login', href: '/admin/login' },
    ],
  },
  {
    heading: 'Legal & Support',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Contact Us', href: SUPPORT_MAILTO, external: true },
    ],
  },
];

/** One row in a link column. 44px tall so a thumb can hit it. */
function FooterLinkRow({ link }: { link: FooterLink }) {
  const className =
    'group inline-flex min-h-[44px] w-fit items-center text-[0.95rem] text-secondary no-underline transition-colors duration-200 hover:text-white';

  const label = (
    <span className="transition-transform duration-200 group-hover:translate-x-0.5">
      {link.label}
    </span>
  );

  if (link.external) {
    return (
      <a href={link.href} className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={className}>
      {label}
    </Link>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-20 sm:mt-32 overflow-hidden rounded-t-[40px] border-t border-white/[0.06] bg-[#0a0a0c]/70 backdrop-blur-xl">
      {/* The brand gradient as a hairline along the top edge, and one soft orb
          behind the columns — the same two devices the pages above use, so the
          footer reads as the end of this site rather than a slab under it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-orange/50 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-accent-blue/10 blur-[150px]"
      />

      <div className="relative grid w-full max-w-7xl grid-cols-1 gap-10 px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.4fr_2fr] lg:gap-16 lg:px-8 mx-auto">
        <div className="flex flex-col gap-6">
          <Link href="/" className="w-fit no-underline" aria-label={`${SITE_NAME} home`}>
            <img
              src="/run-as-one-logo.png"
              alt={SITE_NAME}
              width={1536}
              height={1024}
              className="h-11 w-auto sm:h-14"
            />
          </Link>

          <p className="m-0 max-w-[420px] text-base leading-relaxed text-secondary">
            Race registration for the Philippine running community. Browse open
            events, sign your whole group up in one transaction, and collect
            your official time and e-certificate once the organizer publishes
            them.
          </p>

          <a
            href={SUPPORT_MAILTO}
            className="inline-flex w-fit max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white no-underline transition-colors duration-200 hover:border-accent-orange/40 hover:bg-white/[0.08] sm:text-base"
          >
            <Mail size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
            <span className="break-words">{CONTACT_EMAIL}</span>
          </a>

          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-secondary">
              Follow the community
            </h2>
            <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
              {SOCIAL_CHANNELS.map(channel => (
                <li key={channel.key}>
                  <Link
                    href={socialChannelHref(channel.name)}
                    aria-label={`${channel.name} — coming soon`}
                    title={`${channel.name} — coming soon`}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-secondary transition-all duration-300 hover:-translate-y-0.5 hover:border-transparent hover:bg-gradient-to-r hover:from-accent-orange hover:to-accent-blue hover:text-white"
                  >
                    <BrandGlyph channel={channel.key} size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
          {COLUMNS.map(column => (
            <div key={column.heading} className="flex flex-col">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/90">
                {column.heading}
              </h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {column.links.map(link => (
                  <li key={link.label}>
                    <FooterLinkRow link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="relative border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <p className="m-0 text-sm text-secondary">
            &copy; {year} {SITE_NAME}. All rights reserved.
          </p>
          <p className="m-0 text-xs text-secondary/70 sm:text-sm">
            Built for runners, organizers, and the communities behind them.
          </p>
        </div>
      </div>
    </footer>
  );
}
