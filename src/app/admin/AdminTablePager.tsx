"use client";

import React, { useEffect, useRef, useState } from 'react';
import type { Table } from '@tanstack/react-table';
import { Check, ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The rows-per-page menu and pager under every admin table.
 *
 * Each TanStack screen used to build this inline, and the copies had already
 * started to drift: the team's buttons had names for a screen reader and the
 * events' did not. It is one component now, so a fix lands on every table at
 * once (PROJECT_GUIDE §9, "One admin table").
 *
 * It sits under the table *and* the card list, and reads the same table
 * instance, so the page a person is on survives a resize across `lg`.
 *
 * **From `sm` up it is the desktop pager, unchanged.** Below `sm` it has to fit
 * beside a 56px menu rail on a 360px screen. The range text takes one side and
 * 44px Previous / Next take the other. First and Last step out because four
 * 44px buttons and the range text are wider than that screen. They are
 * shortcuts; every page is still reachable. The rows-per-page menu keeps
 * opening upward from its left-aligned trigger, so it stays on screen.
 */

const PAGE_SIZES = [5, 10, 25, 50] as const;

export default function AdminTablePager<T>({
  table,
  pageSizes = PAGE_SIZES,
}: {
  table: Table<T>;
  pageSizes?: readonly number[];
}) {
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const pageSizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPageSizeOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (pageSizeRef.current && !pageSizeRef.current.contains(event.target as Node)) {
        setIsPageSizeOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsPageSizeOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isPageSizeOpen]);

  const { pageIndex, pageSize } = table.getState().pagination;
  // The row count before paging: the filtered rows of a table paged in the
  // browser, or the `rowCount` a server-paged one (the activity trail) passes.
  const total = table.getRowCount();
  const range =
    total === 0
      ? '0-0 of 0'
      : `${pageIndex * pageSize + 1}-${Math.min((pageIndex + 1) * pageSize, total)} of ${total}`;

  const controls = [
    { label: 'First page', icon: <ChevronFirst className="w-4 h-4" />, onClick: () => table.firstPage(), disabled: !table.getCanPreviousPage(), shortcut: true },
    { label: 'Previous page', icon: <ChevronLeft className="w-4 h-4" />, onClick: () => table.previousPage(), disabled: !table.getCanPreviousPage(), shortcut: false },
    { label: 'Next page', icon: <ChevronRight className="w-4 h-4" />, onClick: () => table.nextPage(), disabled: !table.getCanNextPage(), shortcut: false },
    { label: 'Last page', icon: <ChevronLast className="w-4 h-4" />, onClick: () => table.lastPage(), disabled: !table.getCanNextPage(), shortcut: true },
  ];

  return (
    <div className="flex justify-between items-center flex-wrap gap-4 mt-1">
      <div className="flex items-center gap-3 text-white text-sm font-medium">
        <span className="text-secondary">Rows per page</span>

        <div ref={pageSizeRef} className="relative">
          <button
            type="button"
            onClick={() => setIsPageSizeOpen(!isPageSizeOpen)}
            aria-haspopup="menu"
            aria-expanded={isPageSizeOpen}
            aria-label={`Rows per page: ${pageSize}`}
            className="flex items-center gap-3 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white bg-transparent hover:bg-white/5 transition-colors cursor-pointer max-sm:min-h-11"
          >
            {pageSize}
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {isPageSizeOpen && (
            <div
              role="menu"
              aria-label="Rows per page"
              className="absolute bottom-[calc(100%+4px)] left-0 bg-[#050505] border border-white/10 rounded-md p-1 min-w-[80px] z-50 shadow-2xl"
            >
              {pageSizes.map(size => (
                <button
                  key={size}
                  type="button"
                  role="menuitemradio"
                  aria-checked={pageSize === size}
                  className={`w-full flex items-center justify-between px-3 py-1.5 cursor-pointer rounded-md text-sm transition-colors bg-transparent border-0 max-sm:min-h-11 ${pageSize === size ? 'bg-white/5 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                  onClick={() => {
                    table.setPageSize(size);
                    setIsPageSizeOpen(false);
                  }}
                >
                  <span>{size}</span>
                  {pageSize === size && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 max-sm:w-full max-sm:justify-between">
        <div className="text-white text-sm font-medium">{range}</div>
        <div className="flex gap-1 max-sm:gap-2">
          {controls.map(control => (
            <button
              key={control.label}
              type="button"
              onClick={control.onClick}
              disabled={control.disabled}
              aria-label={control.label}
              className={`flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors max-sm:w-11 max-sm:h-11 ${control.shortcut ? 'max-sm:hidden' : ''}`}
            >
              {control.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
