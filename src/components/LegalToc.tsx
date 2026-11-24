'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type LegalTocItem = { id: string; heading: string };

/** The width at which the jump list stands beside the text (Tailwind `lg`). */
const WIDE = '(min-width: 1024px)';

/**
 * The "On This Page" jump list for the legal pages (components/LegalPage).
 *
 * One list, two shapes. Beside the text from `lg` it is always open and sticky,
 * and the clause being read is marked (`aria-current="location"`, a navy bar on
 * the rail). Below `lg` it folds into a `<details>` above the first clause, so a
 * phone reader meets the text and not a thirteen-row box; following a link
 * folds it again. The CSS also forces the list open at `lg`
 * (`::details-content`), so a wide screen never flashes a closed list before
 * this hydrates; the effect below covers browsers without that selector.
 *
 * The marking is driven by an IntersectionObserver, not a scroll listener: it
 * runs only when a clause crosses the line, and nothing moves, so there is
 * nothing to reduce for motion.
 */
export default function LegalToc({ items }: { items: LegalTocItem[] }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [active, setActive] = useState<string | null>(null);

  // Open on a wide screen, folded on a narrow one, following a resize.
  useEffect(() => {
    const media = window.matchMedia(WIDE);
    const sync = () => {
      if (detailsRef.current) detailsRef.current.open = media.matches;
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // The clause being read: the last one whose top has passed 40% of the way
  // down the screen. The observer only says when to look (a clause crossing
  // that line); the answer is read from the clauses themselves, so the last
  // short clauses at the foot of the page still get their turn.
  useEffect(() => {
    const clauses = items
      .map(item => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (clauses.length === 0 || !('IntersectionObserver' in window)) return;

    const mark = () => {
      const line = window.innerHeight * 0.4;
      const passed = clauses.filter(clause => clause.getBoundingClientRect().top <= line);
      setActive(passed.length > 0 ? passed[passed.length - 1].id : null);
    };
    const observer = new IntersectionObserver(mark, { rootMargin: '0px 0px -60% 0px' });
    clauses.forEach(clause => observer.observe(clause));
    return () => observer.disconnect();
  }, [items]);

  const onFollow = (id: string) => {
    setActive(id);
    if (!window.matchMedia(WIDE).matches && detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <nav aria-label="On This Page" className="legal-toc">
      <p className="legal-toc__title" aria-hidden="true">On This Page</p>
      <details ref={detailsRef} className="legal-toc__fold">
        <summary className="legal-toc__summary">
          <span>On This Page</span>
          <span className="legal-toc__count">{items.length} sections</span>
          <ChevronDown size={18} aria-hidden="true" className="legal-toc__chevron" />
        </summary>
        <ol className="legal-toc__list">
          {items.map((item, index) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="legal-toc__link"
                aria-current={active === item.id ? 'location' : undefined}
                onClick={() => onFollow(item.id)}
              >
                <span className="legal-toc__num" aria-hidden="true">{index + 1}</span>
                <span>{item.heading}</span>
              </a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
