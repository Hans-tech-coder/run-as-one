import React from 'react';
import Link from 'next/link';
import { ChevronRight, Mail } from 'lucide-react';
import { PageOrbs } from './StatusPanel';
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED, SUPPORT_MAILTO } from '@/lib/site-contact';

export type LegalSection = {
  heading: string;
  /** Plain paragraphs, in order. */
  body?: string[];
  /** A list, rendered under the paragraphs. */
  bullets?: string[];
};

/**
 * The shared shell for /terms and /privacy.
 *
 * Two documents with the same job should not be two different-looking pages,
 * and neither should look like a plain-text dump bolted onto a designed site.
 * The header is the eyebrow-plus-gradient-headline used by /events and
 * /results; the body is the same glass panel the rest of the app reads on.
 *
 * Sections carry anchor ids so a support reply can link straight at the clause
 * it is answering about, and scroll-mt clears the floating navbar when one is
 * followed.
 */
export default function LegalPage({
  eyebrow,
  title,
  intro,
  icon,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  icon: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden">
      <PageOrbs />

      <div className="relative z-10 flex w-full flex-col items-center gap-8 sm:gap-12">
        <header className="t-stagger is-shown mb-0 w-full max-w-3xl text-center sm:mb-4">
          <div className="t-stagger-line t-stagger-line--1 mx-auto mb-4 flex w-fit flex-row items-center justify-center gap-2">
            <span className="text-accent-blue">{icon}</span>
            <span className="text-sm font-bold uppercase tracking-widest text-accent-orange">
              {eyebrow}
            </span>
          </div>
          <h1 className="t-stagger-line t-stagger-line--2 mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-3xl font-black uppercase leading-tight tracking-tighter text-transparent text-balance sm:mb-6 sm:text-4xl md:text-6xl">
            {title}
          </h1>
          <p className="t-stagger-line t-stagger-line--3 m-0 text-base leading-relaxed text-secondary sm:text-lg">
            {intro}
          </p>
          <p className="mt-6 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-widest text-secondary">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
        </header>

        {/* Jump list. A runner arriving from a support reply usually wants one
            clause, not the whole document. */}
        <nav
          aria-label="On this page"
          className="w-full max-w-3xl rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
        >
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-secondary">
            On this page
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {sections.map((section, index) => (
              <li key={section.heading}>
                <a
                  href={`#${anchorFor(section.heading)}`}
                  className="inline-flex min-h-[36px] items-center rounded-full border border-white/[0.08] bg-black/40 px-3.5 text-[0.8rem] text-secondary no-underline transition-colors duration-200 hover:border-accent-orange/40 hover:text-white"
                >
                  <span className="mr-1.5 text-white/40">{index + 1}</span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="w-full max-w-3xl overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] sm:p-10">
          <ol className="m-0 flex list-none flex-col gap-10 p-0">
            {sections.map((section, index) => (
              <li
                key={section.heading}
                id={anchorFor(section.heading)}
                className="scroll-mt-[var(--nav-offset)]"
              >
                <h2 className="mb-3 flex items-baseline gap-3 text-lg font-bold text-white sm:text-xl">
                  <span className="bg-gradient-to-r from-accent-orange to-accent-blue bg-clip-text text-sm font-black text-transparent tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{section.heading}</span>
                </h2>

                {section.body?.map(paragraph => (
                  <p
                    key={paragraph}
                    className="mb-3 text-[0.95rem] leading-relaxed text-secondary last:mb-0 sm:text-base"
                  >
                    {paragraph}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="mt-3 mb-0 flex list-none flex-col gap-2 p-0">
                    {section.bullets.map(bullet => (
                      <li
                        key={bullet}
                        className="flex items-start gap-3 rounded-[14px] border border-white/[0.05] bg-black/40 p-3 text-[0.95rem] leading-relaxed text-secondary"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-orange"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </article>

        <aside className="flex w-full max-w-3xl flex-col items-center gap-4 rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-6 text-center sm:p-8">
          <h2 className="m-0 text-lg font-bold text-white sm:text-xl">
            Questions about this page?
          </h2>
          <p className="m-0 max-w-md text-[0.95rem] leading-relaxed text-secondary">
            Email us and a real person will answer. For anything specific to a
            single race — refunds, kit collection, start times — the organizer
            of that event is the fastest route, and their details are on the
            event page.
          </p>
          <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <a
              href={SUPPORT_MAILTO}
              className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white no-underline transition-colors duration-200 hover:border-accent-orange/40 hover:bg-white/[0.08]"
            >
              <Mail size={18} aria-hidden="true" className="shrink-0 text-accent-orange" />
              <span>{CONTACT_EMAIL}</span>
            </a>
            <Link
              href="/events"
              className="btn-gradient group shrink-0 justify-center whitespace-nowrap rounded-[16px] px-6 py-3 text-[0.95rem] no-underline"
            >
              <span>Browse Events</span>
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="shrink-0 transition-transform group-hover:translate-x-1"
              />
            </Link>
          </div>
        </aside>
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
