'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Check, FileBadge } from 'lucide-react';
import BusyLabel from '@/components/ui/BusyLabel';

/**
 * The full leaderboard's small menus — the Category and Gender filters — the
 * dismissal they share, and a row's E-Cert button. Split out of
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
        className="lb-control w-full h-11 flex items-center justify-between sm:justify-start gap-2 px-4 text-sm"
      >
        <span className="flex items-center gap-2">
          {title} {selected.length > 0 && <span className="bg-site-action text-[var(--site-action-ink)] text-[10px] leading-none px-1.5 py-1 rounded-chip">{selected.length}</span>}
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-[250ms] ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <div
        className={`t-dropdown lb-menu lb-menu--roomy absolute top-full mt-2 w-56 max-w-[calc(100vw-2rem)] z-50 overflow-hidden ${align === 'right' ? 'right-0 sm:left-0 sm:right-auto' : 'left-0'} ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
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
                className="lb-menu__item w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
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

// A row's one action: open the runner's e-certificate here, over the
// leaderboard. It was a ⋮ menu of View Details and View E-Cert, but View
// Details did what tapping the row already does, so the menu cost a click for
// nothing; now the certificate is a labelled button of its own. It used to be
// a link to the runner's page with ?cert=1, so the reader lost their place in
// the list for a dialog they could have had where they were. While the
// certificate is drawn the button says so, and the dialog opens when it is
// ready. It stops the press, so the row underneath does not open the result.
export function CertButton({ name, onViewCert, isGenerating }: { name: string, onViewCert: () => Promise<void>, isGenerating: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void onViewCert();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={isGenerating}
      aria-busy={isGenerating || undefined}
      aria-label={`View ${name}'s e-certificate`}
      // A text link, not a bordered button (the owner's call): `.site-link`'s
      // accent text and drawn underline say it can be pressed, the certificate
      // icon says what it opens, and `--arrow` gives it a 44px target.
      // `--still` keeps a leading icon from nudging on hover.
      className="site-link site-link--arrow site-link--still text-sm whitespace-nowrap"
    >
      {isGenerating ? (
        <BusyLabel>Generating</BusyLabel>
      ) : (
        <>
          <FileBadge size={17} aria-hidden="true" />
          <span>E-Cert</span>
        </>
      )}
    </button>
  );
}
