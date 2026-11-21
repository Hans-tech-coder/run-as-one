'use client';

import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronDown, Check } from 'lucide-react';
import RunnerLoader from '@/components/ui/RunnerLoader';
import BusyLabel from '@/components/ui/BusyLabel';
import { cssDurationMs } from '@/lib/css-duration';

/**
 * The full leaderboard's small menus — the Category and Gender filters and a
 * row's ⋮ actions — and the dismissal they share. Split out of
 * FullResultsClient.tsx (AGENTS.md: split before you edit) when the results
 * pages moved to the Paper look, so the leaderboard file holds the table and
 * this one holds the menus.
 */

/**
 * An open/close pair for the small menus on this page, with the dismissal they
 * all need: a press outside closes it, and so does Escape. The outside-press
 * listener is re-bound whenever the menu opens — it used to be bound once on
 * mount, closing over the first render's `isOpen` (false), so a press outside
 * never closed the filter menus and the only way out was the button itself.
 */
export function useDismissableMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => setIsClosing(false), 150); // Matches --dropdown-close-dur
  }, []);

  const toggle = () => {
    if (isOpen) {
      close();
    } else {
      setIsClosing(false);
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    function handlePointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, close]);

  return { isOpen, isClosing, ref, toggle, close };
}

// Custom Dropdown Component using transitions-dev.
// On a phone the two filters split the row between them, so the second one's
// menu opens from its right edge — laid out from the left, a 224px menu
// starting halfway across a 375px screen ran off it.
export function FilterDropdown({ title, options, selected, onToggle, align = 'left' }: { title: string, options: string[], selected: string[], onToggle: (val: string) => void, align?: 'left' | 'right' }) {
  const { isOpen, isClosing, ref, toggle } = useDismissableMenu();

  return (
    <div className="relative flex-1 sm:flex-none" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="w-full h-11 flex items-center justify-between sm:justify-start gap-2 bg-dark/50 border border-site-line px-4 rounded-xl text-sm text-site-ink hover:border-site-line transition-colors"
      >
        <span className="flex items-center gap-2">
          {title} {selected.length > 0 && <span className="bg-accent-blue text-site-ink text-[10px] leading-none px-1.5 py-1 rounded-full">{selected.length}</span>}
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-[250ms] ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <div
        className={`t-dropdown absolute top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-[#1a1a20] border border-site-line rounded-xl shadow-xl z-50 overflow-hidden ${align === 'right' ? 'right-0 sm:left-0 sm:right-auto' : 'left-0'} ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        data-origin={align === 'right' ? 'top-right' : 'top-left'}
      >
        <div className="max-h-60 overflow-y-auto p-2 scrollbar-thin">
          {options.length === 0 && <div className="p-2 text-xs text-secondary">No options</div>}
          {options.map(opt => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                aria-pressed={isSelected}
                className="w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 text-sm rounded-lg hover:bg-site-surface transition-colors"
              >
                <span className={`truncate ${isSelected ? 'text-site-accent font-medium' : 'text-secondary'}`}>{opt}</span>
                {isSelected && <Check size={14} className="text-site-accent shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
}

// Custom Action Menu using transitions-dev.
// The menu is rendered into <body> and positioned against the trigger's viewport
// rect, because the results card and its horizontal scroller both clip their
// overflow — a menu laid out inside the row was cut off on the last rows. It
// also flips above the trigger when the space below it cannot hold the menu.
// View E-Cert opens the certificate here, over the leaderboard: it used to be
// a link to the runner's page with ?cert=1, so the reader lost their place in
// the list for a dialog they could have had where they were. The menu stays
// open, its item saying the certificate is being drawn, until it is ready.
export function ActionMenu({ path, onViewCert, isGenerating }: { path: string, onViewCert: () => Promise<void>, isGenerating: boolean }) {
  const MENU_WIDTH = 160;   // matches w-40
  const MENU_HEIGHT = 104;  // the two items plus padding, used before the first measure
  const GAP = 8;            // the old mt-2
  const EDGE = 8;           // breathing room against the viewport edges

  const [isOpen, setIsOpen] = useState(false);
  // True once in the browser, where there is a <body> to portal into; false
  // on the server render. A store read rather than a set-state-in-effect.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [placement, setPlacement] = useState<{ top: number, left: number, origin: 'top-right' | 'bottom-right' }>({
    top: 0,
    left: 0,
    origin: 'top-right',
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);


  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight || MENU_HEIGHT;

    const roomBelow = window.innerHeight - rect.bottom - GAP - EDGE;
    const roomAbove = rect.top - GAP - EDGE;
    const flipUp = height > roomBelow && roomAbove >= height;

    setPlacement({
      top: flipUp ? rect.top - GAP - height : rect.bottom + GAP,
      left: Math.min(
        Math.max(rect.right - MENU_WIDTH, EDGE),
        Math.max(window.innerWidth - MENU_WIDTH - EDGE, EDGE)
      ),
      origin: flipUp ? 'bottom-right' : 'top-right',
    });
  }, []);

  const close = useCallback(() => {
    const el = menuRef.current;
    if (!el) {
      setIsOpen(false);
      return;
    }
    const closeMs = cssDurationMs('--dropdown-close-dur', 150);

    el.classList.remove('is-open');
    el.classList.add('is-closing');
    setTimeout(() => setIsOpen(false), closeMs);
  }, []);

  // Once the menu is in the DOM its real height is known, so measure again and
  // play the open transition on the next frame.
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const frame = requestAnimationFrame(() => {
      menuRef.current?.classList.remove('is-closing');
      menuRef.current?.classList.add('is-open');
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    }
    function handleScrollOrResize() {
      updatePosition();
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, close, updatePosition]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      close();
    } else {
      updatePosition();
      setIsOpen(true);
    }
  };

  const menu = (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="t-dropdown fixed w-40 bg-[#1a1a20] border border-site-line rounded-xl shadow-xl overflow-hidden"
      data-origin={placement.origin}
      style={{ top: placement.top, left: placement.left, zIndex: 9999 }}
    >
      <div className="p-1">
        <Link
          href={path}
          onClick={(e) => e.stopPropagation()}
          className="w-full text-left block px-3 py-2.5 text-sm text-site-ink rounded-lg hover:bg-site-surface transition-colors"
        >
          View Details
        </Link>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            await onViewCert();
            close();
          }}
          disabled={isGenerating}
          aria-busy={isGenerating || undefined}
          className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm text-site-accent font-medium rounded-lg hover:bg-site-surface disabled:hover:bg-transparent disabled:cursor-wait transition-colors"
        >
          {isGenerating ? <BusyLabel>Generating</BusyLabel> : 'View E-Cert'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-site-surface transition-colors text-secondary hover:text-site-ink"
        title="Actions"
        aria-label="Result actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>

      {/* Into the Paper frame when there is one, so the menu wears the page's
          tokens; the frame carries no transform, so fixed positioning holds. */}
      {mounted && isOpen && createPortal(menu, document.querySelector('.site-paper') ?? document.body)}
    </>
  );
}

/** useSyncExternalStore's subscribe for a value that never changes. */
function noSubscribe() {
  return () => {};
}
