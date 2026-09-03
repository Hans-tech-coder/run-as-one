"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Plus, Users } from 'lucide-react';
import {
  communitySlug,
  normalizeCommunityName,
  MAX_COMMUNITY_NAME_LENGTH,
} from '@/lib/running-community';

/**
 * The running club a runner represents, typed with suggestions.
 *
 * A plain <select> was the obvious choice and the wrong one: the list is over
 * fifty clubs today and only grows, which is a long scroll on a phone, and it
 * has no room for the club that is not on the list yet. So this is a combobox —
 * type to narrow, or write in something new.
 *
 * Free text is deliberately allowed. The field is optional, the answer is the
 * runner's own, and holding up their registration over a club name nobody has
 * approved yet would be the wrong trade. What a write-in does not get is a
 * place in everyone else's suggestions: that waits for the super admin.
 *
 * Shared by both wizards, so a fun run and a race ask the question the same way.
 */
export default function CommunityPicker({
  value,
  options,
  onChange,
  onAdd,
}: {
  value: string;
  /** Approved club names, already sorted. */
  options: readonly string[];
  onChange: (name: string) => void;
  /**
   * A write-in the runner committed to with the "Add" row. The wizard holds
   * these so a second runner on the same registration can pick the club their
   * team-mate just added, without waiting for it to be approved.
   */
  onAdd: (name: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // One picker is rendered per runner, so every id here has to be unique or the
  // listbox of runner two would be labelled by the input of runner one.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const inputId = `${baseId}-input`;

  // The wizard owns this value: it resets participants on "Add another runner"
  // and rehydrates them when a cancelled order comes back.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const trimmed = normalizeCommunityName(query);

  const matches = useMemo(() => {
    if (!trimmed) return options;
    const needle = trimmed.toUpperCase();
    // Prefix matches first: someone typing "SAN" wants the two SAN clubs above
    // any club that merely contains those letters in the middle.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of options) {
      const haystack = name.toUpperCase();
      if (haystack.startsWith(needle)) starts.push(name);
      else if (haystack.includes(needle)) contains.push(name);
    }
    return [...starts, ...contains];
  }, [options, trimmed]);

  // Only offer to add something the list does not already hold. An exact match
  // in any casing is the existing club, not a new one.
  const slug = communitySlug(trimmed);
  const canAdd =
    trimmed.length > 0 && !options.some(name => communitySlug(name) === slug);

  const rows: Array<{ kind: 'option' | 'add'; name: string }> = [
    ...(canAdd ? [{ kind: 'add' as const, name: trimmed }] : []),
    ...matches.map(name => ({ kind: 'option' as const, name })),
  ];

  const close = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const commit = (row: { kind: 'option' | 'add'; name: string }) => {
    if (row.kind === 'add') onAdd(row.name);
    onChange(row.name);
    setQuery(row.name);
    close();
  };

  // Clicking anywhere else is a dismissal, not a selection. Whatever is typed
  // stays as the answer — see the note about free text above.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  // Keep the highlighted row inside the scroll box while arrowing through a
  // list this long.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
        return;
      }
      if (rows.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(prev => {
        // Nothing highlighted yet: down starts at the top, up starts at the
        // bottom. Wrapping arithmetic alone would land one short on the way up.
        if (prev < 0) return step === 1 ? 0 : rows.length - 1;
        return (prev + step + rows.length) % rows.length;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && rows[activeIndex]) {
        // Only swallow the key when it actually picked something, so Enter on a
        // closed picker still behaves the way it does in the rest of the form.
        e.preventDefault();
        commit(rows[activeIndex]);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        e.stopPropagation();
        close();
      }
      return;
    }

    if (e.key === 'Tab') close();
  };

  const handleBlur = () => {
    // Snap to the list's own casing when the runner typed a club that exists.
    // "team army" and "TEAM ARMY" should not read as two clubs in the export.
    const exact = options.find(name => communitySlug(name) === slug);
    const next = exact ?? trimmed;
    if (next !== query) setQuery(next);
    if (next !== value) onChange(next);
  };

  return (
    <div className="input-group full-width">
      <label htmlFor={inputId}>Running Community / Club (Optional)</label>

      <div ref={wrapperRef} className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? `${baseId}-row-${activeIndex}` : undefined
          }
          maxLength={MAX_COMMUNITY_NAME_LENGTH}
          value={query}
          placeholder="Type to search, or add your own"
          onChange={e => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          style={{ width: '100%' }}
        />

        {isOpen && rows.length > 0 && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Running communities"
            className="absolute z-30 left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-[12px] border border-white/15 bg-[#0d0d0f] shadow-[0_16px_40px_rgba(0,0,0,0.6)] py-1"
          >
            {rows.map((row, index) => {
              const isActive = index === activeIndex;
              const isSelected =
                row.kind === 'option' &&
                communitySlug(row.name) === communitySlug(value);

              return (
                <li
                  key={`${row.kind}-${row.name}`}
                  id={`${baseId}-row-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  // pointerdown, not click: the input's blur would otherwise
                  // close the list before a click ever landed.
                  onPointerDown={e => {
                    e.preventDefault();
                    commit(row);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex items-center gap-2 px-4 py-3 cursor-pointer text-sm transition-colors ${
                    isActive ? 'bg-white/10' : ''
                  } ${row.kind === 'add' ? 'text-accent-orange font-semibold' : 'text-white'}`}
                >
                  {row.kind === 'add' ? (
                    <>
                      <Plus size={16} className="shrink-0" />
                      <span className="truncate">Add &ldquo;{row.name}&rdquo;</span>
                    </>
                  ) : (
                    <>
                      {isSelected ? (
                        <Check size={16} className="shrink-0 text-accent-orange" />
                      ) : (
                        <Users size={16} className="shrink-0 text-white/30" />
                      )}
                      <span className="truncate">{row.name}</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-secondary">
        {canAdd
          ? 'Not on the list? Choose Add to register with it. It goes to the organizers for review before it shows up as a suggestion for anyone else.'
          : 'Leave blank if you run on your own.'}
      </p>
    </div>
  );
}
