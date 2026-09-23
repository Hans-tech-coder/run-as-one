"use client";

import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CornerDownLeft, Search } from 'lucide-react';

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
 * **It reaches races by name too** (Batch 2). The nav rows and the settings
 * pages are already in the client and answer instantly; a race's title is not,
 * because which events a person may see depends on their role, so typing two
 * characters asks `GET /api/admin/search` for the ones they may reach and adds
 * them under their own heading *below* the static rows.
 *
 * Three things about that are deliberate:
 * - **The static rows are never displaced.** They render from the first
 *   keystroke and stay put while the request is in flight, so a slow or failed
 *   search costs the palette nothing — it is simply the Batch 1 palette again.
 *   The fetch has no error state of its own for the same reason.
 * - **Results append rather than interleave**, so an answer arriving between a
 *   keystroke and Enter cannot move the row the cursor is already on.
 * - **The last answer is held while the next is typed.** Clearing the list on
 *   every keystroke would flash the rows out and back for anyone typing at
 *   speed; a stale row for 180ms is better than a blinking list.
 */

export type QuickJumpTarget = {
  label: string;
  href: string;
  /** The heading it is listed under — the sidebar's own group, or Settings. */
  group: string;
  /** A quiet second line on the row: a race's day, so two "Fun Run"s differ. */
  meta?: string;
  icon?: React.ReactNode;
};

/** Windows first: it is what the server has to render, having no machine to ask. */
const DEFAULT_MOD = 'Ctrl';

/** Matches the route's own floor, so a query it would refuse is never sent. */
const MIN_QUERY = 2;

/** Long enough that a typed word is one request, short enough to feel typed-into. */
const SEARCH_DEBOUNCE_MS = 180;

/** Says where the rows go, and does not collide with the sidebar's "Races". */
const EVENTS_GROUP = 'Event registrants';

/** One race as the search route answers with it. */
type EventHit = { id: string; title: string; day: string; href: string };

/** One frozen empty list, so "no races" is not a new array on every render. */
const NO_EVENTS: QuickJumpTarget[] = [];

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
  // The last answered search, held as one object: "is this answer still the
  // one being typed?" is then a comparison, not a second piece of state that
  // can disagree with the first.
  const [result, setResult] = useState<{ needle: string; targets: QuickJumpTarget[] }>({
    needle: '',
    targets: [],
  });
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

  const needle = query.trim();
  const searchable = needle.length >= MIN_QUERY;

  /**
   * Whether the last answer still stands. It does while the word it answered
   * is being extended or backspaced — which is all that happens between two
   * keystrokes — and stops the moment the field holds a different search, so
   * a cleared box followed by a new word can never show the old race for a
   * beat. Derived rather than cleared in an effect: there is then no frame in
   * which the two disagree.
   */
  const holds =
    result.needle.length > 0 &&
    (needle.startsWith(result.needle) || result.needle.startsWith(needle));

  const events = searchable && holds ? result.targets : NO_EVENTS;
  const searching = searchable && result.needle !== needle;

  /**
   * The races this person may reach, asked for as they type (Batch 2).
   *
   * `live` rather than the AbortController alone: aborting rejects the fetch,
   * whose `catch` then runs after the next request is already out, and would
   * otherwise publish an answer to a search nobody is making any more.
   */
  useEffect(() => {
    if (!searchable) return;

    let live = true;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      let targets: QuickJumpTarget[] = [];
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(needle)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        const data: { events?: EventHit[] } = await response.json();
        targets = (data.events ?? []).map(hit => ({
          label: hit.title,
          href: hit.href,
          group: EVENTS_GROUP,
          meta: hit.day,
          icon: <CalendarDays size={16} />,
        }));
      } catch {
        // Deliberately silent, and deliberately still an answer: recording the
        // empty result under this needle is what stops the spinner. The menu's
        // own rows are on screen and still work, and an error banner over them
        // would take away the one thing the palette can always do.
      }
      if (live) setResult({ needle, targets });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [needle, searchable]);

  // The heading rides on the first row of its run, so a search that crosses
  // sections still says which is which without a second list level. It is
  // worked out here rather than while the rows render: a variable carried
  // across a map is state in the middle of a render, which React is right to
  // refuse.
  const matches = useMemo(() => {
    const lowered = needle.toLowerCase();
    const fromMenu = lowered
      ? targets.filter(
          target =>
            target.label.toLowerCase().includes(lowered) ||
            target.group.toLowerCase().includes(lowered),
        )
      : targets;
    // The races come last and are not re-filtered here: the route already
    // matched them, and re-testing them against a needle that has moved on
    // since the request went out would drop rows for no reason.
    const found = lowered ? [...fromMenu, ...events] : fromMenu;
    return found.map((target, index) => ({
      target,
      heading: index === 0 || found[index - 1].group !== target.group ? target.group : null,
    }));
  }, [needle, targets, events]);

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
          <p className="dash-jump-empty">
            {searching ? 'Searching…' : `Nothing matches “${needle}”.`}
          </p>
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
                  {target.meta && <span className="dash-jump-row-meta">{target.meta}</span>}
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
