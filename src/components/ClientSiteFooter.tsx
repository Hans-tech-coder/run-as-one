"use client";

import React from 'react';
import Link from 'next/link';
import { Globe, Mail, Phone } from 'lucide-react';
import { ClientSiteLogo } from './ClientSiteLogo';
import { FooterContactChip, FooterNav, FooterShell, FooterSocials, type FooterColumn } from './FooterParts';
import { SITE_NAME, supportMailto } from '@/lib/site-contact';
import type { SiteClient } from '@/lib/site-client';
import { useContactEmail } from './SiteContactProvider';

/**
 * The footer on a client's own site (CLIENT_SUBDOMAIN_PLAN.md D9).
 *
 * The client's logo, name, public email and phone, website and socials — the
 * ones saved under /admin/clients › Site & branding, each left out when
 * blank. **Payment questions still go to Run As One**, which takes and
 * validates every payment, so its contact address stays here, said plainly.
 * Privacy and Terms are Run As One's and stay. The Organizers column does
 * not: a client's runners are not who it is for.
 */
export default function ClientSiteFooter({ site }: { site: SiteClient }) {
  const year = new Date().getFullYear();
  const contactEmail = useContactEmail();

  const columns: FooterColumn[] = [
    {
      heading: 'Explore',
      links: [
        { label: 'Browse Events', href: '/events' },
        { label: 'Race Results', href: '/results' },
      ],
    },
    {
      heading: 'Legal & Support',
      links: [
        { label: 'Send Feedback', href: '/feedback' },
        { label: 'Terms of Service', href: '/terms' },
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Payment Concerns', href: supportMailto(contactEmail), external: true },
      ],
    },
  ];

  // Saved with its scheme (normalizeLink), but only ever linked as http(s).
  const website = site.website && /^https?:\/\//i.test(site.website) ? site.website : null;
  const hasContacts = Boolean(site.publicEmail || site.publicPhone || website);

  return (
    <FooterShell
      brand={
        <>
          <Link href="/events" className="w-fit max-w-full no-underline">
            <ClientSiteLogo site={site} size="footer" />
          </Link>

          <p className="m-0 max-w-[420px] text-base leading-relaxed text-secondary">
            Official race registration and results for {site.name}. Sign your
            whole group up in one transaction, and collect your time and
            e-certificate once results are published.
          </p>

          {hasContacts && (
            <div className="flex flex-col gap-3">
              {site.publicEmail && (
                <FooterContactChip href={`mailto:${site.publicEmail}`} icon={<Mail size={18} />}>
                  {site.publicEmail}
                </FooterContactChip>
              )}
              {site.publicPhone && (
                <FooterContactChip href={`tel:${site.publicPhone}`} icon={<Phone size={18} />}>
                  {site.publicPhone}
                </FooterContactChip>
              )}
              {website && (
                <FooterContactChip href={website} icon={<Globe size={18} />}>
                  {website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </FooterContactChip>
              )}
            </div>
          )}

          <FooterSocials
            links={{
              facebook: site.facebookUrl,
              instagram: site.instagramUrl,
              tiktok: site.tiktokUrl,
              youtube: site.youtubeUrl,
            }}
            owner={site.name}
            heading={`Follow ${site.name}`}
          />

          <p className="m-0 max-w-[420px] text-sm leading-relaxed text-secondary">
            Payments are taken and confirmed by {SITE_NAME}. For a payment
            concern, email{' '}
            <a
              href={supportMailto(contactEmail)}
              className="break-words text-white underline-offset-4 hover:underline"
            >
              {contactEmail}
            </a>
            .
          </p>
        </>
      }
      nav={<FooterNav columns={columns} />}
      bottomLeft={<>&copy; {year} {site.name}. All rights reserved.</>}
      bottomRight={<>Powered by {SITE_NAME}</>}
    />
  );
}
