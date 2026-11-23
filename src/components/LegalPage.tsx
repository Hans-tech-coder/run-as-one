import React from 'react';
import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { LEGAL_LAST_UPDATED, supportMailto } from '@/lib/site-contact';

export type LegalSection = {
  heading: string;
  /** Plain paragraphs, in order. */
  body?: string[];
  /** A list, rendered under the paragraphs. */
  bullets?: string[];
};

/**
 * The shared shell for /terms and /privacy, on Paper (docs/conventions.md §9).
 *
 * Two documents with the same job should not be two different-looking pages,
 * and they are read, not scanned: so the page is set for reading rather than
 * dressed up. The text column is held to about 68 characters, the body is ink
 * on paper at 17px with generous leading, and each clause is a numbered
 * heading on a hairline, so the rhythm down the page is the same every time.
 * The bullets are a plain list, not a stack of boxed cards — a card per
 * sentence turned a list into a wall of tiles.
 *
 * The jump list sits beside the text on a wide screen (sticky, so it is there
 * at the twelfth clause too) and above it on a phone. Sections carry anchor
 * ids so a support reply can link straight at the clause it is answering
 * about, and scroll-mt clears the navbar when one is followed.
 */
export default function LegalPage({
  eyebrow,
  title,
  intro,
  icon,
  sections,
  contactEmail,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  icon: React.ReactNode;
  sections: LegalSection[];
  /** The saved contact address (lib/site-settings.ts), read by the page. */
  contactEmail: string;
}) {
  return (
    <>
      <section className="legal-intro site-section site-wrap" data-enter>
        <p className="m-0 mb-4 flex items-center gap-2 text-[0.9375rem] font-semibold text-site-accent">
          {icon}
          {eyebrow}
        </p>
        <h1 className="site-h1 max-w-[16ch]">{title}</h1>
        <p className="site-lead max-w-[60ch]">{intro}</p>
        <p className="m-0 mt-5 text-sm text-site-muted">Last updated {LEGAL_LAST_UPDATED}</p>
      </section>

      <div className="site-section site-wrap">
        <div className="legal-layout">
          {/* Jump list. A runner arriving from a support reply usually wants
              one clause, not the whole document. */}
          <nav aria-label="On This Page" className="legal-toc">
            <h2 className="legal-toc__title">On This Page</h2>
            <ol className="legal-toc__list">
              {sections.map((section, index) => (
                <li key={section.heading}>
                  <a href={`#${anchorFor(section.heading)}`} className="legal-toc__link">
                    <span className="legal-toc__num" aria-hidden="true">{index + 1}</span>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0">
            <ol className="legal-body">
              {sections.map((section, index) => (
                <li
                  key={section.heading}
                  id={anchorFor(section.heading)}
                  className="legal-clause scroll-mt-[calc(var(--nav-offset)+1rem)]"
                >
                  <h2 className="legal-clause__head">
                    <span className="legal-clause__num">{String(index + 1).padStart(2, '0')}</span>
                    <span>{section.heading}</span>
                  </h2>

                  {section.body?.map(paragraph => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}

                  {section.bullets && (
                    <ul>
                      {section.bullets.map(bullet => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>

            <aside className="legal-ask">
              <h2 className="site-h3">Questions About This Page?</h2>
              <p className="m-0 mt-3 max-w-[56ch] leading-relaxed text-site-muted">
                Email us and a real person will answer. For anything specific to a
                single race — refunds, kit collection, start times — the organizer
                of that event is the fastest route, and their details are on the
                event page.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={supportMailto(contactEmail)} className="site-btn site-btn--quiet site-btn--block-sm">
                  <Mail size={18} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 break-all">{contactEmail}</span>
                </a>
                <Link href="/events" className="site-btn site-btn--action site-btn--block-sm">
                  Browse Events
                  <ArrowRight size={18} aria-hidden="true" className="shrink-0" />
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

/** A heading turned into a stable, linkable id. */
function anchorFor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
