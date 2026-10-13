"use client";

import React from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { RunAsOneLogo } from './RunAsOneLogo';
import ClientSiteFooter from './ClientSiteFooter';
import { FooterContactChip, FooterNav, FooterShell, FooterSocials, type FooterColumn } from './FooterParts';
import { SITE_NAME, supportMailto } from '@/lib/site-contact';
import type { SiteClient } from '@/lib/site-client';
import { useContactEmail, useSocialLinks } from './SiteContactProvider';

/**
 * Every destination in the footer, and nothing that does not exist.
 *
 * The columns this replaced advertised marathons, pricing, resources and an
 * FAQ that were never built, so a runner who trusted the footer landed on a
 * 404 — the worst possible moment on a page whose job is to look like the site
 * can be trusted with a payment. Each href below resolves to a real route, a
 * or a real mail client. A social channel appears only once its link is saved
 * at /admin/settings; one without a link is left out, not sent to a
 * placeholder.
 *
 * On a client's site (`site` set) the footer is the client's instead
 * (ClientSiteFooter.tsx, CLIENT_SUBDOMAIN_PLAN.md D9).
 */

/** Built per render: Contact Us follows the saved contact address. */
const columns = (contactEmail: string): FooterColumn[] => [
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
      { label: 'Our Services', href: '/admin/register' },
      { label: 'Organizer Login', href: '/admin/login' },
    ],
  },
  {
    heading: 'Legal & Support',
    links: [
      // Above Contact Us on purpose: a form somebody can fill in here is a
      // lower bar than composing an email, and most of what people want to
      // tell us about the app fits in it.
      { label: 'Send Feedback', href: '/feedback' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Contact Us', href: supportMailto(contactEmail), external: true },
    ],
  },
];

export default function Footer({ site }: { site: SiteClient | null }) {
  const year = new Date().getFullYear();
  const contactEmail = useContactEmail();
  const socialLinks = useSocialLinks();

  if (site) return <ClientSiteFooter site={site} />;

  return (
    <FooterShell
      brand={
        <>
          <Link href="/" className="w-fit no-underline" aria-label={`${SITE_NAME} home`}>
            <RunAsOneLogo className="[--rao-logo-size:40px] sm:[--rao-logo-size:48px]" decorative />
          </Link>

          <p className="m-0 max-w-[420px] text-base leading-relaxed text-secondary">
            Race registration for the running community. Browse open
            events, sign your whole group up in one transaction, and collect
            your official time and e-certificate once the organizer publishes
            them.
          </p>

          <FooterContactChip href={supportMailto(contactEmail)} icon={<Mail size={18} />}>
            {contactEmail}
          </FooterContactChip>

          <FooterSocials links={socialLinks} owner={SITE_NAME} heading="Follow the community" />
        </>
      }
      nav={<FooterNav columns={columns(contactEmail)} />}
      bottomLeft={<>&copy; {year} {SITE_NAME}. All rights reserved.</>}
      bottomRight="Built for runners, organizers, and the communities behind them."
    />
  );
}
