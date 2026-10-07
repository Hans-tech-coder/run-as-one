"use client";

import React, { useEffect, useState } from 'react';
import './guide-layout.css';

/**
 * "On this page": the guide's sections, beside it from `xl` up and sticky
 * under the header, with the one being read marked (`aria-current`).
 *
 * The guide is six panels long, and on a wide screen the reading column left
 * a strip of empty dashboard beside it. A contents list is the documentation
 * page's own answer to that: it fills the strip with something a reader uses,
 * and it lets a client jump straight to the checklist or the file specs when
 * they come back to check one thing. Below `xl` it is not drawn; the page is
 * one column and the panels are the contents.
 *
 * The current section is the last one whose top has passed under the sticky
 * header, read on scroll (one read per frame), and the last section once the
 * page is scrolled to its foot, since a short final section never reaches the
 * top. A link scrolls smoothly unless the reader asked for reduced motion, and
 * replaces the URL's hash rather than pushing one, so Back still leaves the
 * page instead of walking back through its sections.
 */

/** The sticky header's height plus a little air: where "reached" is measured. */
const READ_LINE = 120;

export default function GuideToc({ items }: { items: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id ?? '');

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const scroller = document.scrollingElement ?? document.documentElement;
      const atFoot = scroller.scrollTop + window.innerHeight >= scroller.scrollHeight - 4;
      let reached = items[0]?.id ?? '';
      for (const { id } of items) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= READ_LINE) reached = id;
      }
      setCurrent(atFoot ? items[items.length - 1].id : reached);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    // Captured on the document, so a scroll of whichever element scrolls the
    // dashboard is heard, not only the window's.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  const jump = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    setCurrent(id);
  };

  return (
    <nav className="cert-guide-toc" aria-label="On this page">
      <p className="cert-guide-toc-title">On this page</p>
      <ol>
        {items.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={current === id ? 'location' : undefined}
              onClick={event => jump(event, id)}
            >
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
