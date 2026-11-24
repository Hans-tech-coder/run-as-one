import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArrowRight, Mail } from 'lucide-react';
import { SITE_NAME, SOCIAL_CHANNELS, supportMailto, type SocialChannel } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';
import PageReveal from '@/components/PageReveal';

export const metadata: Metadata = {
  title: `Coming Soon | ${SITE_NAME}`,
  description:
    'Our social channels are still being set up. In the meantime, browse open running events or email us directly.',
};

/**
 * Where the footer's social icons used to land before those accounts existed.
 *
 * The footer now shows a channel only once its link is saved at
 * /admin/settings (lib/site-settings.ts), so nothing on the site links here
 * any more. The page stays for the addresses already shared or bookmarked: a
 * channel that has a saved link by now is sent straight to it, and one that
 * still has none gets this page, which says so plainly and hands the runner a
 * working way to reach us.
 *
 * A Paper notice (site.css `.site-notice`, shared with the 404): the line, the
 * reason, and the two ways forward.
 */
export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const channel = channelFrom((await searchParams).channel);
  const { contactEmail, socialLinks } = await getSiteSettings();

  // Only ever a link staff saved, never anything from the query string.
  const live = channel ? socialLinks[channel.key] : null;
  if (live) redirect(live);

  return (
    <PageReveal>
      <section className="site-section site-wrap">
        <div className="site-notice" data-enter>
          <p className="site-notice__code">Coming Soon</p>
          <h1 className="site-h1">
            {channel ? `Our ${channel.name} Isn't Live Yet` : 'Our Social Channels Are on the Way'}
          </h1>
          <p className="site-lead max-w-[56ch]">
            We&apos;re still setting this one up. Nothing about registering is
            waiting on it — events are open now, and the fastest way to reach
            a real person is email.
          </p>
          <div className="site-notice__actions">
            <Link href="/events" className="site-btn site-btn--action site-btn--block-sm">
              Browse Events
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a href={supportMailto(contactEmail)} className="site-btn site-btn--quiet site-btn--block-sm">
              <Mail size={18} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 break-all">{contactEmail}</span>
            </a>
          </div>
        </div>
      </section>
    </PageReveal>
  );
}

/**
 * The channel named in the query string, matched against the list we actually
 * publish.
 *
 * Matching rather than echoing: the value lands in a heading, and an arbitrary
 * string from a URL does not belong there.
 */
function channelFrom(value: string | string[] | undefined): SocialChannel | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const match = SOCIAL_CHANNELS.find(
    channel => channel.name.toLowerCase() === raw.trim().toLowerCase()
  );
  return match ?? null;
}
