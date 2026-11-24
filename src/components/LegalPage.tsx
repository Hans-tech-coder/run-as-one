import React from 'react';
import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { LEGAL_LAST_UPDATED, supportMailto } from '@/lib/site-contact';
import LegalToc from '@/components/LegalToc';

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
 * The whole page is one centred column set (`.legal-shell`): the header, the
 * jump list and the text share it, so on a wide screen the rail and the text
 * sit as one block with even margins instead of a narrow column pushed left
 * with a blank strip beside it. The jump list (LegalToc) is a sticky rail from
 * `lg` that marks the clause being read, and a folded list above the text on a
 * tablet or a phone. Sections carry anchor ids so a support reply can link
 * straight at the clause it is answering about, and scroll-mt clears the
 * navbar when one is followed. No entrance fade: a legal page is read, and it
 * should simply be there.
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
  const toc = sections.map(section => ({ id: anchorFor(section.heading), heading: section.heading }));

  return (
    <div className="site-wrap">
      <div className="legal-shell">
        <header className="legal-head">
          <p className="m-0 mb-4 flex items-center gap-2 text-[0.9375rem] font-semibold text-site-accent">
            {icon}
            {eyebrow}
          </p>
          <h1 className="site-h1">{title}</h1>
          <p className="site-lead max-w-[60ch]">{intro}</p>
          <p className="legal-head__updated">Last updated {LEGAL_LAST_UPDATED}</p>
        </header>

        <div className="legal-layout">
          {/* Jump list. A runner arriving from a support reply usually wants
              one clause, not the whole document. */}
          <LegalToc items={toc} />

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
    </div>
  );
}

/** A heading turned into a stable, linkable id. */
function anchorFor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
