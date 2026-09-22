"use client";

import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search } from 'lucide-react';

/**
 * The dashboard's quick jump — ⌘K on a Mac, Ctrl+K everywhere else
 * (DASHBOARD_SHELL_PLAN.md, Batch 1).
 *
 * Staff move between nine sections and four settings pages all day, and before
 * this the only way was to read the sidebar. This is the same list, searchable,
 * over the page you are already on.
 *
 * **It is the app's modal, not a new one.** The scrim, the solid panel and the
 * scale-in are `AlertModal`'s — `.t-modal` in `globals.css`, which already
 * honours `prefers-reduced-motion`; this only toggles `is-open` / `is-closing`,
 * and the shell owns those two flags so the close animation can finish before
 * the component unmounts.
 *
 * **It is an ARIA combobox**, not a list of buttons: focus stays in the field
 * the whole time and `aria-activedescendant` names the row the arrows are on,
 * which is what lets a person type and choose without ever leaving the
 * keyboard. The rows are therefore not tab stops by design, and Tab is held
 * inside the dialog rather than walking out into the page behind it.
 *
 * What it can reach is Batch 1's answer: the nav and the settings pages, all of
 * it already in the client. Reaching a single event by name needs a search
 * route and is Batch 2.
 */

export type QuickJumpTarget = {
  label: string;
  href: string;
  /** The heading it is listed under — the sidebar's own group, or Settings. */
  group: string;
  icon?: React.ReactNode;
};

/** Windows first: it is what the server has to render, having no machine to ask. */
const DEFAULT_MOD = 'Ctrl';

export default function DashboardQuickJump({
  open,
  closing,
  targets,
  onClose,
}: {
  /** Drives the scale-in. Set one frame after mount so the transition runs. */
  open: boolean;
  closing: boolean;
  targets: QuickJumpTarget[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [shown, setShown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const titleId = useId();

  // `.t-modal` scales up from `--modal-scale`, so the open class has to land on
  // a frame *after* the one that mounted it or the browser has nothing to
  // transition from and the panel simply appears.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // The heading rides on the first row of its run, so a search that crosses
  // sections still says which is which without a second list level. It is
  // worked out here rather than while the rows render: a variable carried
  // across a map is state in the middle of a render, which React is right to
  // refuse.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const found = needle
      ? targets.filter(
          target =>
            target.label.toLowerCase().includes(needle) ||
            target.group.toLowerCase().includes(needle),
        )
      : targets;
    return found.map((target, index) => ({
      target,
      heading: index === 0 || found[index - 1].group !== target.group ? target.group : null,
    }));
  }, [query, targets]);

  // A narrowing search can leave the cursor past the end of what is left, so
  // it is clamped where it is read rather than corrected after the fact.
  const activeIndex = matches.length ? Math.min(cursor, matches.length - 1) : -1;
  const active = activeIndex >= 0 ? matches[activeIndex].target : null;

  // Keep the row the arrows are on inside the scroll box.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const go = (target: QuickJumpTarget) => {
    onClose();
    router.push(target.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      // The field is the only tab stop in here; the rows answer to the arrows.
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor(c => (matches.length ? (Math.min(c, matches.length - 1) + 1) % matches.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor(c =>
        matches.length ? (Math.min(c, matches.length - 1) + matches.length - 1) % matches.length : 0,
      );
      return;
    }
    if (event.key === 'Enter' && active) {
      event.preventDefault();
      go(active);
    }
  };

  return (
    <div
      className={`dash-jump-scrim ${open && !closing ? 'is-open' : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`dash-jump-panel t-modal ${shown && !closing ? 'is-open' : ''} ${
          closing ? 'is-closing' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={event => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="sr-only">
          Jump to a page
        </h2>

        <div className="dash-jump-field">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="dash-jump-input"
            value={query}
            // A new search starts at its own first row, never on whatever
            // index the last one happened to leave behind.
            onChange={event => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder="Jump to a page"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active ? `${listId}-${activeIndex}` : undefined}
          />
        </div>

        {matches.length === 0 ? (
          <p className="dash-jump-empty">No page matches “{query.trim()}”.</p>
        ) : (
          <ul ref={listRef} id={listId} className="dash-jump-list" role="listbox" aria-label="Pages">
            {matches.map(({ target, heading }, index) => (
              <li
                key={target.href}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`dash-jump-row ${index === activeIndex ? 'is-active' : ''}`}
                // Keeps focus in the field, so aria-activedescendant stays true.
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(target)}
              >
                {heading && <span className="dash-jump-group">{heading}</span>}
                <span className="dash-jump-row-body">
                  <span className="dash-jump-row-icon" aria-hidden="true">
                    {target.icon ?? <Search size={16} />}
                  </span>
                  <span className="dash-jump-row-label">{target.label}</span>
                  {index === activeIndex && (
                    <CornerDownLeft className="dash-jump-row-enter" size={14} aria-hidden="true" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="dash-jump-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The shortcut as this machine writes it, for the sidebar's own row. Read the
 * way the shell reads the viewport's width — a snapshot the server answers with
 * Windows' spelling and the client settles on its first render — rather than
 * state pushed from an effect, which would render the wrong key once on every
 * Mac before correcting itself.
 */
export function useModifierLabel() {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? '⌘' : DEFAULT_MOD),
    () => DEFAULT_MOD,
  );
}
