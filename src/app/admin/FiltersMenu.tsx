"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import FilterOptions, { type FilterOption } from './FilterOptions';

/** One shelf of the sheet: a heading and its checkable options. */
export type FilterGroup = {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Coded lists (payment, gender) are capitalized; names are shown as typed. */
  capitalize?: boolean;
};

/**
 * The one Filters chip and its sheet, at every width — the events list's
 * filter, made shared so every dashboard table filters the same way. A row of
 * one-chip-per-value toggles or one-menu-per-column crowded the toolbar and
 * read differently from screen to screen; this keeps every filter behind one
 * chip whose count says how many are on.
 *
 * The chip only draws what it is given: the screen owns the selections and
 * applies them to its data before the table, so search, sort and the pager
 * work inside the result. A group with no options is left out rather than
 * drawn as an empty heading. Anchored from `sm` up and a bottom sheet below,
 * through `.toolbar-popover`.
 */
export default function FiltersMenu({
  groups,
  onClear,
  empty,
  align = 'left',
}: {
  groups: FilterGroup[];
  onClear: () => void;
  /**
   * What the sheet says when no group has an option — lists built from the
   * rows are empty on a race nobody has entered yet, and a sheet opening as a
   * bare strip at the foot of a phone reads as broken.
   */
  empty?: string;
  /** Open from the chip's right edge, for a chip at the right of its row. */
  align?: 'left' | 'right';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [isOpen]);

  const activeCount = groups.reduce((sum, group) => sum + group.selected.length, 0);

  return (
    <div ref={ref} className="relative view-dropdown-container">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="btn-filter max-lg:min-h-11"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Filter size={16} aria-hidden="true" /> Filters
        {activeCount > 0 && <span className="ml-1 px-1 bg-white/10 rounded">{activeCount}</span>}
      </button>
      {isOpen && (
        <div
          role="group"
          aria-label="Filter the list"
          className={`toolbar-popover absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-72 max-h-[70vh] overflow-y-auto bg-[#050505] border border-white/10 rounded-md p-2 z-50 shadow-2xl`}
        >
          {empty && groups.every(group => group.options.length === 0) && (
            <p className="m-0 px-2 py-3 text-sm text-secondary">{empty}</p>
          )}
          {groups.map(group => group.options.length > 0 && (
            <div key={group.label} role="menu" aria-label={group.label} className="pb-1">
              <p className="m-0 px-2 pt-1 pb-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                {group.label}
              </p>
              <FilterOptions
                options={group.options}
                selected={group.selected}
                onToggle={group.onToggle}
                capitalize={group.capitalize ?? false}
              />
            </div>
          ))}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mt-1 w-full flex items-center px-2 py-1.5 rounded-md text-sm text-gray-400 bg-transparent border-0 border-t border-white/5 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
