import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight, Mail, Radar } from 'lucide-react';
import { IconBadge, PageOrbs, StatusPanel } from '@/components/StatusPanel';
import { CONTACT_EMAIL, SOCIAL_CHANNELS, SUPPORT_MAILTO } from '@/lib/site-contact';

export const metadata: Metadata = {
  title: 'Coming Soon | RunAsOne',
  description:
    'Our social channels are still being set up. In the meantime, browse open running events or email us directly.',
};

/**
 * Where the footer's social icons land until those accounts exist.
 *
 * The alternative was an `href="#"` that does nothing, or a guessed profile
 * URL that may not be ours — both leave the runner worse off than a page that
 * simply says the channel is not live yet and hands them a working way to
 * reach us. When the real URLs land in site-contact.ts, the footer points at
 * them directly and this page keeps serving the ones that are still pending.
 */
export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const channel = channelNameFrom((await searchParams).channel);

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      <PageOrbs />

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
              {channel ? `Our ${channel} Isn't Live Yet` : 'Our Social Channels Are On The Way'}
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
              href={SUPPORT_MAILTO}
              className="flex min-h-[56px] w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-sm text-white no-underline transition-colors duration-200 hover:border-accent-orange/40 hover:bg-white/[0.08] sm:w-auto"
            >
              <Mail size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
              <span>{CONTACT_EMAIL}</span>
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
function channelNameFrom(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const match = SOCIAL_CHANNELS.find(
    channel => channel.name.toLowerCase() === raw.trim().toLowerCase()
  );
  return match ? match.name : null;
}
