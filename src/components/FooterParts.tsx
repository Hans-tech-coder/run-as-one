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
  const className = 'site-footer__link group w-fit';

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
          <h2 className="mb-2 text-sm font-semibold">
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
      <h2 className="site-footer__muted mb-3 text-sm font-semibold">
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
              className="site-footer__social"
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
      className="site-footer__chip text-sm sm:text-base"
    >
      <span aria-hidden="true" className="site-footer__muted flex shrink-0">{icon}</span>
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
  // The ink band that closes the page (site.css `.site-footer`): one flat
  // inverted ground, no glass, orb or gradient hairline.
  return (
    <footer className="site-footer">
      <div className="site-wrap grid grid-cols-1 gap-10 pt-12 pb-10 sm:pt-16 lg:grid-cols-[1.4fr_2fr] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-6">{brand}</div>
        {nav}
      </div>

      <div className="site-footer__line border-t">
        <div className="site-wrap flex flex-col items-center justify-between gap-2 py-6 text-center sm:flex-row sm:text-left">
          <p className="site-footer__muted m-0 text-sm">{bottomLeft}</p>
          <p className="site-footer__muted m-0 text-sm">{bottomRight}</p>
        </div>
      </div>
    </footer>
  );
}
