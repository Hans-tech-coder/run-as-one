import React from 'react';
import type { Metadata } from 'next';
import { ClipboardCheck } from 'lucide-react';
import { IconBadge } from '@/components/StatusPanel';
import { SITE_NAME } from '@/lib/site-contact';
import { getSiteSettings } from '@/lib/site-settings';
import TrackLookup from './TrackLookup';

export const metadata: Metadata = {
  title: `Track My Registration | ${SITE_NAME}`,
  description: 'Check whether your race registration is paid or validated, and that your details are right.',
  // Somebody's registration is not a page for a search engine.
  robots: { index: false, follow: false },
};

/**
 * Track My Registration (TRACK_PAGE_PLAN.md): where a registrant answers "am I
 * paid?", "was my bank transfer validated?" and "are my details right?"
 * themselves, instead of messaging staff.
 *
 * The page itself holds nothing about anybody: the form POSTs to `/api/track`
 * and the answer is drawn in the browser from the masked view the route
 * returns. `Cache-Control: no-store` is set for `/track` in next.config.ts.
 */
export default async function TrackPage() {
  const { contactEmail, socialLinks } = await getSiteSettings();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center pb-20 pt-8 sm:pt-12">
      <header className="mb-8 flex flex-col items-center text-center sm:mb-10">
        <IconBadge>
          <ClipboardCheck size={30} aria-hidden="true" />
        </IconBadge>
        <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">Your registration</p>
        <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
          Track My Registration
        </h1>
        <p className="m-0 max-w-lg text-base leading-relaxed text-secondary">
          See whether your registration is paid or your bank transfer is
          validated, and check the details you submitted. Enter the reference
          from your registration email and the email you used.
        </p>
      </header>

      <TrackLookup help={{ contactEmail, facebookUrl: socialLinks.facebook }} />
    </div>
  );
}
