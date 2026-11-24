import React from 'react';
import type { Metadata } from 'next';
import FeedbackForm from './FeedbackForm';
import { SITE_NAME, supportMailto } from '@/lib/site-contact';
import { getContactEmail } from '@/lib/site-settings';
import { asSitePath } from '@/lib/feedback';
import PageReveal from '@/components/PageReveal';

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
 *
 * On Paper (docs/conventions.md §9): the heading and the lead beside the form
 * on a wide screen, above it on a phone, so the form is on the first screen.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).from;
  const pagePath = asSitePath(Array.isArray(raw) ? raw[0] : raw);
  const contactEmail = await getContactEmail();

  return (
    <PageReveal>
      <section className="site-section site-wrap">
        <div className="feedback-layout">
          <header className="feedback-layout__intro" data-enter>
            <p className="m-0 mb-4 text-[0.9375rem] font-semibold text-site-accent">Feedback</p>
            <h1 className="site-h1">Tell Us What to Fix</h1>
            <p className="site-lead">
              Something not working, something that could be easier, or something
              you wish this app could do — all three belong here. A real person
              reads every message, and nothing you send goes to a mailing list.
            </p>

            {/* The address stays on the page on purpose. The form takes one
                screenshot, but some things need several files or a thread, and
                a form is the wrong shape for those — offering only the form
                would send that person away with nothing. */}
            <p className="m-0 mt-6 text-[0.9375rem] leading-relaxed text-site-muted">
              Need to send more files or talk it through?{' '}
              <a href={supportMailto(contactEmail)} className="site-link [overflow-wrap:anywhere]">
                {contactEmail}
              </a>
            </p>
          </header>

          <FeedbackForm pagePath={pagePath} />
        </div>
      </section>
    </PageReveal>
  );
}
