import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ChevronRight, Clock, Link2Off } from 'lucide-react';
import { IconBadge, StatusPanel } from '@/components/StatusPanel';
import { SITE_NAME, SITE_URL } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';
import { SITE_URL_HEADER } from '@/lib/site-host';
import { TRACK_LOOKUP_RULE, allowRequest, callerKeyOf } from '@/lib/rate-limit';
import { readTrackToken } from '@/lib/track-link';
import { readTrackView, trackHome } from '@/lib/track';
import { ensureEventHost } from '@/lib/site-client';
import TrackResult from '../TrackResult';

export const metadata: Metadata = {
  title: `Track My Registration | ${SITE_NAME}`,
  // A link that opens somebody's registration is not a page for a search engine.
  robots: { index: false, follow: false },
};

/**
 * The emailed Track My Registration link (TRACK_PAGE_PLAN.md D8): the same view
 * as the form on /track, opened by the signed token in both registration emails
 * (lib/track-link.ts), so the runner types nothing.
 *
 * **On the order's own site**, as `/pay/[token]` is: opened on another host it
 * is sent to its race's site (`ensureEventHost`), so a client's runner sees the
 * client's branding and nobody else's race appears under it.
 *
 * Throttled like the lookup, because opening it reads the database. A token
 * that is forged, expired or names a removed order gets one designed panel
 * pointing at the form (PROJECT_GUIDE §8 rule 1), never a bare 404.
 */
export default async function TrackLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestHeaders = await headers();
  if (!allowRequest('track', callerKeyOf(requestHeaders), TRACK_LOOKUP_RULE)) {
    return (
      <Notice
        icon={<Clock size={30} aria-hidden="true" />}
        title="Too Many Tries"
        body="Your registration was looked up many times from your connection in the last minute. Wait a minute, then open the link again."
      />
    );
  }

  const scope = await readTrackToken(token);
  const home = scope ? await trackHome(scope.registrationId) : null;
  if (home) await ensureEventHost(home.event);
  const view = scope && home ? await readTrackView(scope, requestHeaders.get(SITE_URL_HEADER) ?? SITE_URL) : null;
  if (!view) {
    return (
      <Notice
        icon={<Link2Off size={30} aria-hidden="true" />}
        title="This Link Does Not Work"
        body="The link may be old, or the registration it pointed to was removed. Look it up with your reference and email instead."
      />
    );
  }

  const { contactEmail, socialLinks } = await getSiteSettings();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center pb-20 pt-8 sm:pt-12">
      <p className="mb-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">Track my registration</p>
      <TrackResult view={view} help={{ contactEmail, facebookUrl: socialLinks.facebook }} />
    </div>
  );
}

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
      <StatusPanel>
        <div className="flex flex-col items-center text-center">
          <IconBadge>{icon}</IconBadge>
          <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">Track my registration</p>
          <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
            {title}
          </h1>
          <p className="m-0 max-w-md text-base leading-relaxed text-secondary">{body}</p>
        </div>
        <div className="mt-8 flex justify-center">
          <Link
            href="/track"
            className="btn-gradient group w-full justify-center whitespace-nowrap rounded-[16px] px-8 py-4 text-center text-base no-underline shadow-xl shadow-accent-orange/20 sm:w-auto"
          >
            <span>Look Up My Registration</span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </StatusPanel>
    </div>
  );
}
