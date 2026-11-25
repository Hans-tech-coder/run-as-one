"use client";

import React, { useId, useMemo, useRef, useState } from 'react';
import { Check, Plus, Users } from 'lucide-react';
import { upperCaseAsTyped } from '@/lib/text-case';
import { communitySlug, MAX_COMMUNITY_NAME_LENGTH, normalizeCommunityName } from '@/lib/running-community';

/**
 * The running club, as the dashboard asks it: typed, with the approved clubs
 * suggested — the website's `CommunityPicker` in the admin's own field and
 * list (AdminSelect's look). Used where staff enter a runner by hand (the
 * staff registration form), so "CRC" and "CRESENDO RUNNING CLUB" are not two
 * clubs in the export just because staff typed it differently.
 *
 * Same rules as the website's: optional, blank means INDEPENDENT RUNNER;
 * prefix matches list first; a name already on the list snaps to the list's
 * own spelling on blur; a club not on the list can still be used (*Add "…"*)
 * and goes to the Communities review queue when the order is saved, not into
 * anyone's suggestions. `added` holds the write-ins of this form, so Runner 2
 * can pick the club Runner 1 just added.
 *
 * A combobox in the ARIA sense: the input keeps focus, ↑/↓ move through the
 * list, Enter picks, Escape closes.
 */
export default function AdminCommunityField({
  id,
  label = 'Running Community',
  value,
  options,
  added = [],
  onChange,
  onAdd,
}: {
  id: string;
  label?: React.ReactNode;
  value: string;
  /** Approved club names, sorted. */
  options: readonly string[];
  /** Write-ins already used on this form. */
  added?: readonly string[];
  onChange: (name: string) => void;
  onAdd?: (name: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const hintId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const trimmed = normalizeCommunityName(value);
  const slug = communitySlug(trimmed);
  const all = useMemo(() => {
    const seen = new Set(options.map(communitySlug));
    return [...options, ...added.filter(name => !seen.has(communitySlug(name)))];
  }, [options, added]);
  const canAdd = trimmed.length > 0 && !all.some(name => communitySlug(name) === slug);

  // Prefix matches first: "SAN" wants the SAN clubs above any that merely
  // contain those letters.
  const rows = useMemo(() => {
    const needle = trimmed.toUpperCase();
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of all) {
      const hay = name.toUpperCase();
      if (!needle || hay.startsWith(needle)) starts.push(name);
      else if (hay.includes(needle)) contains.push(name);
    }
    const matches = [...starts, ...contains].map(name => ({ name, add: false }));
    return canAdd ? [{ name: trimmed, add: true }, ...matches] : matches;
  }, [all, trimmed, canAdd]);

  const pick = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onChange(row.name);
    if (row.add) onAdd?.(row.name);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const scrollTo = (index: number) => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      if (rows.length === 0) return;
      const next = e.key === 'ArrowDown'
        ? (activeIndex + 1) % rows.length
        : (activeIndex - 1 + rows.length) % rows.length;
      setActiveIndex(next);
      scrollTo(next);
    } else if (e.key === 'Enter' && isOpen && activeIndex >= 0) {
      e.preventDefault();
      pick(activeIndex);
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label} <span className="text-xs opacity-70">- optional</span>
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-row-${activeIndex}` : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          maxLength={MAX_COMMUNITY_NAME_LENGTH}
          value={value}
          placeholder="INDEPENDENT RUNNER"
          onChange={e => {
            onChange(upperCaseAsTyped(e.target.value));
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            setIsOpen(false);
            // Snap to the list's own spelling: "team army" and "TEAM ARMY"
            // must not read as two clubs.
            const cleaned = normalizeCommunityName(value);
            const exact = all.find(name => communitySlug(name) === communitySlug(cleaned));
            const next = exact ?? cleaned;
            if (next !== value) onChange(next);
          }}
          onKeyDown={onKeyDown}
          className="form-input"
        />
        {isOpen && rows.length > 0 && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Running communities"
            className="absolute z-50 left-0 right-0 top-full mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-panel border border-[var(--ink-15)] bg-[var(--dash-panel-solid)] shadow-[0_16px_40px_var(--dash-shadow)] py-1"
          >
            {rows.map((row, index) => {
              const selected = !row.add && communitySlug(row.name) === slug;
              return (
                <li
                  key={`${row.add ? 'add' : 'club'}-${row.name}`}
                  id={`${listId}-row-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  // Picks on pointerdown so the input keeps focus and its blur
                  // does not close the list first.
                  onPointerDown={e => {
                    e.preventDefault();
                    pick(index);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex items-center gap-2 px-4 py-3 cursor-pointer text-sm transition-colors ${
                    row.add ? 'text-accent-orange-ink font-medium' : 'text-primary'
                  } ${index === activeIndex ? 'bg-[var(--ink-10)]' : ''}`}
                >
                  {row.add ? (
                    <Plus size={16} className="shrink-0" aria-hidden="true" />
                  ) : selected ? (
                    <Check size={16} className="shrink-0 text-accent-orange-ink" aria-hidden="true" />
                  ) : (
                    <Users size={16} className="shrink-0 text-[var(--ink-30)]" aria-hidden="true" />
                  )}
                  <span className="truncate">{row.add ? `Add “${row.name}”` : row.name}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p id={hintId} className="text-xs text-secondary m-0">
        {canAdd
          ? 'Not on the list? Add it to use it. It goes to Communities for review before anyone else sees it as a suggestion.'
          : 'Leave blank if they run on their own.'}
      </p>
    </div>
  );
}
