import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ChevronRight, Mail, Radar } from 'lucide-react';
import { IconBadge, StatusPanel } from '@/components/StatusPanel';
import { SITE_NAME, SOCIAL_CHANNELS, supportMailto, type SocialChannel } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';

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
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
        <StatusPanel>
          <div className="flex flex-col items-center text-center">
            <IconBadge>
              <Radar size={30} aria-hidden="true" />
            </IconBadge>

            <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">
              Coming Soon
            </p>
            <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
              {channel ? `Our ${channel.name} Isn't Live Yet` : 'Our Social Channels Are On The Way'}
            </h1>
            <p className="m-0 max-w-md text-base leading-relaxed text-secondary">
              We&apos;re still setting this one up. Nothing about registering is
              waiting on it — events are open now, and the fastest way to reach
              a real person is email.
            </p>
          </div>

          {/* Both buttons keep their intrinsic width — shrink-0 — and wrap onto
              a second row rather than squeezing. Letting them shrink is what
              broke "Browse Events" across two lines beside a much wider email
              address, leaving one tall button next to one short one. */}
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
            <a
              href={supportMailto(contactEmail)}
              className="btn-secondary w-full shrink-0 whitespace-nowrap text-center sm:w-auto"
            >
              <Mail size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
              <span className="font-medium normal-case tracking-normal">{contactEmail}</span>
            </a>
          </div>
        </StatusPanel>
      </div>
    </div>
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
