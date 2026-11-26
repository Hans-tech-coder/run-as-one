import React from 'react';
import type { Metadata } from 'next';
import ContactForm from './ContactForm';
import { SITE_NAME, supportMailto } from '@/lib/site-contact';
import { getContactEmail } from '@/lib/site-settings';
import { requestSiteClient, siteOrigin } from '@/lib/site-client';
import { MAIN_SITE } from '@/lib/site-host';
import { contactRaces } from '@/lib/contact-races';
import PageReveal from '@/components/PageReveal';

export const metadata: Metadata = {
  title: `Contact Us | ${SITE_NAME}`,
  description:
    'Questions about a registration, a payment, your race kit, results or organizing a race? Send Run As One a message and a real person will reply by email.',
  // Served on every host, client subdomains too; the main site's copy is the one to index.
  alternates: { canonical: `${siteOrigin(MAIN_SITE)}/contact` },
};

/**
 * Contact Us: one form whose message is emailed to the site's contact address
 * (`/api/contact`, lib/contact-inquiry.ts). It replaced the bare `mailto:` the
 * footer and the 404 used to open, which sent a runner off the site to a blank
 * email. The address stays on the page as the other way in — for a thread, or
 * files the form does not take.
 *
 * Served on every host, client subdomains too (it lives outside `s/[site]` and
 * learns its site from the proxy, like `/feedback`); a client site's races are
 * its own, and the message still goes to Run As One's inbox.
 *
 * On Paper (docs/conventions.md §9): the heading and lead beside the form from
 * `lg`, above it on a phone. No reply time is promised until the owner sets one.
 */
export default async function ContactPage() {
  const [contactEmail, site] = await Promise.all([getContactEmail(), requestSiteClient()]);
  const races = await contactRaces(site?.id ?? null);

  return (
    <PageReveal>
      <section className="site-section site-wrap">
        <div className="feedback-layout">
          <header className="feedback-layout__intro" data-enter>
            <p className="m-0 mb-4 text-[0.9375rem] font-semibold text-site-accent">Questions and Inquiries</p>
            <h1 className="site-h1">Contact Us</h1>
            <p className="site-lead">
              Ask about a registration, a payment, your race kit, results, or
              having us run your race. A real person reads every message and
              replies to the email you leave.
            </p>

            <p className="m-0 mt-6 text-[0.9375rem] leading-relaxed text-site-muted">
              Rather write an email?{' '}
              <a href={supportMailto(contactEmail)} className="site-link [overflow-wrap:anywhere]">
                {contactEmail}
              </a>
            </p>
          </header>

          <ContactForm races={races} contactEmail={contactEmail} />
        </div>
      </section>
    </PageReveal>
  );
}
