import React from 'react';
import type { Metadata } from 'next';
import { MessageSquareHeart } from 'lucide-react';
import FeedbackForm from './FeedbackForm';
import { CONTACT_EMAIL, SITE_NAME, SUPPORT_MAILTO } from '@/lib/site-contact';
import { asSitePath } from '@/lib/feedback';

export const metadata: Metadata = {
  title: `Send Feedback | ${SITE_NAME}`,
  description:
    'Tell us what is broken, what could be better, and what you wish this app could do. A real person reads every message.',
};

/**
 * The one place a runner or an organizer can tell us about the app itself.
 *
 * Until this existed the only channel was the support address in the footer,
 * which asks somebody to leave the site, open a mail client and compose a
 * message from a blank page — so the only feedback that ever arrived was from
 * people annoyed enough to do all three. The point of a form is the people in
 * between: the ones who noticed something odd, would say so in twenty seconds,
 * and will not write an email about it.
 *
 * It is a page of its own rather than a floating widget on every screen. A
 * persistent bubble is the usual shortcut and it costs more than it looks:
 * it covers the bottom-right corner on a phone, which on this site is where the
 * wizard's Next button and the leaderboard's pager live, and the home page is
 * meant to showcase events rather than argue with a badge. So the entry points
 * are placed instead of floated — the footer, which is on every public page,
 * and the moment straight after a registration, which is the one time we know
 * for certain that somebody has just used the app end to end.
 *
 * `?from=` is how those entry points say where the sender came from. It is a
 * query string, so `asSitePath` treats it as somebody else's text until it has
 * been checked, and the form shows the sender what is about to be attached
 * rather than collecting it quietly.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).from;
  const pagePath = asSitePath(Array.isArray(raw) ? raw[0] : raw);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center pb-20 pt-8 sm:pt-12">
      <header className="mb-8 flex flex-col items-center text-center sm:mb-10">
        <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-accent-orange/20 bg-accent-orange/10 text-accent-orange shadow-[0_0_20px_rgba(255,107,0,0.15)]">
          <MessageSquareHeart size={30} aria-hidden="true" />
        </div>

        <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-[0.3em] text-secondary">
          Feedback
        </p>
        <h1 className="mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-2xl font-black uppercase tracking-wide text-transparent text-balance sm:text-3xl">
          Tell Us What To Fix
        </h1>
        <p className="m-0 max-w-lg text-base leading-relaxed text-secondary">
          Something not working, something that could be easier, or something
          you wish this app could do — all three belong here. A real person
          reads every message, and nothing you send goes to a mailing list.
        </p>
      </header>

      <FeedbackForm pagePath={pagePath} />

      {/* The address stays on the page on purpose. Some things need an
          attachment, a screenshot or a thread, and a form is the wrong shape
          for those — offering only the form would send that person away with
          nothing. */}
      <p className="mt-6 text-center text-sm text-secondary">
        Need to send a screenshot or talk it through?{' '}
        <a
          href={SUPPORT_MAILTO}
          className="text-white underline decoration-accent-orange/50 underline-offset-4 transition-colors hover:decoration-accent-orange"
        >
          {CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}
