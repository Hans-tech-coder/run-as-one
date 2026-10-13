"use client";

import React from 'react';
import Link from 'next/link';
import { BrandGlyph } from './BrandIcons';
import { SOCIAL_CHANNELS, type SocialLinks } from '@/lib/site-contact';

/**
 * The pieces both footers are built from: Run As One's on the main site
 * (Footer.tsx) and a client's on its own site (ClientSiteFooter.tsx,
 * CLIENT_SUBDOMAIN_PLAN.md D9). One frame, so the two read as the same site
 * wearing different names.
 */
export type FooterLink = { label: string; href: string; external?: boolean };
export type FooterColumn = { heading: string; links: FooterLink[] };

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

/** The link columns on the right. */
export function FooterNav({ columns }: { columns: FooterColumn[] }) {
  return (
    <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
      {columns.map(column => (
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
  );
}

/**
 * The saved social links as round icons, under `heading`. A channel without a
 * link is left out, and with none at all the whole block is: no heading over
 * an empty row.
 */
export function FooterSocials({
  links,
  owner,
  heading,
}: {
  links: SocialLinks;
  /** Whose accounts these are, for the screen-reader label. */
  owner: string;
  heading: string;
}) {
  const channels = SOCIAL_CHANNELS.flatMap(channel => {
    const href = links[channel.key];
    return href ? [{ ...channel, href }] : [];
  });
  if (channels.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-secondary">
        {heading}
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
        {channels.map(channel => (
          <li key={channel.key}>
            <a
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${owner} on ${channel.name} (opens in a new tab)`}
              title={channel.name}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-secondary transition-all duration-300 hover:-translate-y-0.5 hover:border-transparent hover:bg-gradient-to-r hover:from-accent-orange hover:to-accent-blue hover:text-white"
            >
              <BrandGlyph channel={channel.key} size={18} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A contact chip: the saved address or number, with its icon. */
export function FooterContactChip({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex w-fit max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white no-underline transition-colors duration-200 hover:border-accent-orange/40 hover:bg-white/[0.08] sm:text-base"
    >
      <span aria-hidden="true" className="flex shrink-0 text-accent-orange">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </a>
  );
}

/**
 * The footer itself: the brand column (`brand`) beside the link columns
 * (`nav`), and a bottom bar.
 */
export function FooterShell({
  brand,
  nav,
  bottomLeft,
  bottomRight,
}: {
  brand: React.ReactNode;
  nav: React.ReactNode;
  bottomLeft: React.ReactNode;
  bottomRight: React.ReactNode;
}) {
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
        <div className="flex min-w-0 flex-col gap-6">{brand}</div>
        {nav}
      </div>

      <div className="relative border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <p className="m-0 text-sm text-secondary">{bottomLeft}</p>
          <p className="m-0 text-xs text-secondary/70 sm:text-sm">{bottomRight}</p>
        </div>
      </div>
    </footer>
  );
}
