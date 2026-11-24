'use client';

import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { Table } from '@tanstack/react-table';
import { useDismissableMenu } from './FullResultsMenus';

// `.lb-control` (site.css): the same edge, hover and press as the filters, and
// no hover at all while disabled.
const PAGER_BUTTON = "lb-control w-10 h-10 flex items-center justify-center";

/**
 * The full leaderboard's foot: rows per page and the pager. Split out of
 * FullResultsClient; `turnPage` is the client's, so a page turn still scrolls
 * the list's top back into view.
 */
export default function FullResultsPager<T>({
  table,
  pageIndex,
  pageSize,
  turnPage,
}: {
  table: Table<T>;
  pageIndex: number;
  pageSize: number;
  turnPage: (go: () => void) => void;
}) {
  // Destructured, as FilterDropdown does: the hooks lint reads a whole
  // object holding a ref as a ref read during render.
  const { ref: menuRef, isOpen, isClosing, toggle, close } = useDismissableMenu();
  const pagerButton = PAGER_BUTTON;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-12">
      <div className="flex items-center gap-3 text-sm text-secondary">
        <span>Rows per Page:</span>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="true"
            aria-expanded={isOpen}
            className="lb-control h-10 flex items-center gap-1.5 px-3.5"
          >
            {pageSize}
            <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          <div
            className={`t-dropdown lb-menu absolute bottom-full left-0 mb-2 w-24 p-1 z-50 overflow-hidden ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
            data-origin="bottom-left"
          >
            {[10, 25, 50, 100].map(size => (
              <button
                key={size}
                type="button"
                onClick={() => { turnPage(() => table.setPageSize(size)); close(); }}
                aria-current={pageSize === size || undefined}
                className={`lb-menu__item w-full text-left px-3 py-2 text-sm ${pageSize === size ? 'text-site-accent font-medium' : 'text-site-ink'}`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-1 sm:gap-2 text-sm" aria-label="Results pages">
        <button type="button" onClick={() => turnPage(() => table.setPageIndex(0))} disabled={!table.getCanPreviousPage()} className={pagerButton} aria-label="First page">
          <ChevronsLeft size={18} />
        </button>
        <button type="button" onClick={() => turnPage(() => table.previousPage())} disabled={!table.getCanPreviousPage()} className={pagerButton} aria-label="Previous page">
          <ChevronLeft size={18} />
        </button>
        <span className="text-secondary px-1.5 sm:px-2 whitespace-nowrap tabular-nums">
          Page <span className="font-medium text-site-ink">{pageIndex + 1}</span> of{' '}
          <span className="font-medium text-site-ink">{table.getPageCount() || 1}</span>
        </span>
        <button type="button" onClick={() => turnPage(() => table.nextPage())} disabled={!table.getCanNextPage()} className={pagerButton} aria-label="Next page">
          <ChevronRight size={18} />
        </button>
        <button type="button" onClick={() => turnPage(() => table.setPageIndex(table.getPageCount() - 1))} disabled={!table.getCanNextPage()} className={pagerButton} aria-label="Last page">
          <ChevronsRight size={18} />
        </button>
      </nav>
    </div>
  );
}
