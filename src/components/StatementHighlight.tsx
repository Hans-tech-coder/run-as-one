'use client';

import { useEffect, useRef } from 'react';

/** A run of the statement: plain words, or `{ strong }` words that turn to the accent. */
export type StatementPart = string | { strong: string };

/**
 * One large statement whose words turn from a resting grey to ink, word by
 * word, as it crosses the middle of the screen — the `word-highlight` moment
 * of `design-taste-frontend` (the one scroll moment a Paper page is dealt),
 * rebuilt on the site's own tokens instead of the kit's loader. A `{ strong }`
 * part turns to the accent instead of the ink.
 *
 * Scrubbed to the scrollbar: it runs back on the way up, and at the foot of
 * the page every word stands in ink. Nothing else moves, and it never sits in
 * a card. The words are rendered on the server, so without script — and under
 * reduced motion — the whole statement is ink from the start (`.is-live` is
 * what turns the resting grey on, site.css "The statement"). The resting grey
 * still reads at 4.8:1, so a word is never hidden while it waits.
 *
 * The scroll is read passively, once a frame, and only while the statement is
 * on screen; the words are toggled on the DOM directly, so scrolling never
 * re-renders the page.
 */
export default function StatementHighlight({ parts, className = '' }: { parts: StatementPart[]; className?: string }) {
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const text = textRef.current;
    if (!text || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const words = [...text.querySelectorAll<HTMLElement>('.site-statement__word')];
    text.classList.add('is-live');

    let lit = -1;
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      const start = vh * 0.85; // the statement's top here lights the first word
      const end = vh * 0.45; // its bottom here lights the last
      const r = text.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (start - r.top) / Math.max(1, start - end + r.height)));
      const atFoot = vh + window.scrollY >= document.documentElement.scrollHeight - 2;
      const k = atFoot ? words.length : Math.round(t * words.length);
      if (k === lit) return;
      lit = k;
      words.forEach((w, i) => w.classList.toggle('is-on', i < k));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    let listening = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !listening) {
        listening = true;
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        onScroll();
      } else if (!entry.isIntersecting && listening) {
        listening = false;
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        onScroll(); // settle at the end it left by
      }
    });
    observer.observe(text);
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      text.classList.remove('is-live');
    };
  }, []);

  return (
    <p ref={textRef} className={`site-statement__text ${className}`.trim()}>
      {parts.flatMap((part, p) => {
        const strong = typeof part !== 'string';
        const words = (strong ? part.strong : part).split(/\s+/).filter(Boolean);
        const spans = words.map((word, w) => (
          <span key={`${p}-${w}`} className="site-statement__word">
            {word}
          </span>
        ));
        const run = spans.flatMap((span, w) => (w === 0 ? [span] : [' ', span]));
        const spaced = p === 0 ? run : [' ', ...run];
        return strong ? [<strong key={`s-${p}`}>{spaced}</strong>] : spaced;
      })}
    </p>
  );
}
