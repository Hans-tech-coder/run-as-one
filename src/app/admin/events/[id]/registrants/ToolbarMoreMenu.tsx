"use client";

import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * The registrants toolbar's *More* chip: the occasional actions (Export to
 * CSV today), kept off the line above the table so it stays short as the
 * screen gains features (the owner, 2026-11-25). The everyday action, Add
 * Registration, stays a button of its own beside it.
 *
 * Icon plus label, never a bare `⋮` (standing rule §8.6). The vertical
 * dots are the row menu's (`RowActionsMenu`), so one shape means "more
 * actions" everywhere in the dashboard. Each item is an icon and a label, with an optional note under it — the export says
 * whether it takes the ticked rows or the filtered list. A `.toolbar-popover`
 * like Sort and View: a bottom sheet on a phone.
 */

export type MoreItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  note?: string;
  onSelect: () => void;
};

export default function ToolbarMoreMenu({ items }: { items: MoreItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  if (items.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="btn-filter whitespace-nowrap"
      >
        <MoreVertical size={16} aria-hidden="true" /> More
      </button>
      {isOpen && (
        <div
          role="group"
          aria-label="More actions"
          className="toolbar-popover absolute right-0 top-full mt-2 w-64 bg-[var(--dash-popover)] border border-[var(--dash-border)] rounded-control p-2 z-50 shadow-2xl"
        >
          <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
            {items.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    item.onSelect();
                  }}
                  className="w-full flex items-start gap-3 px-2 py-2 rounded-control text-left bg-transparent border-0 hover:bg-[var(--dash-hover)] transition-colors cursor-pointer"
                >
                  <span className="mt-0.5 shrink-0 text-secondary">{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm text-primary font-medium">{item.label}</span>
                    {item.note && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{item.note}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
