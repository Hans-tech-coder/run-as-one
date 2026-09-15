"use client";

import React, { useEffect, useRef, useState } from 'react';
import type { Column, Table } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/**
 * The Sort chip a table's toolbar gains below `lg`.
 *
 * A table is sorted by clicking its column headers, and the card list a table
 * becomes below `lg` has no headers to click. Rather than losing sort on a
 * phone, the toolbar carries this chip, which offers the very columns the
 * headers would: every leaf column TanStack says can sort, in column order,
 * each ascending or descending. It writes to the same table instance, so a
 * sort chosen here is still in force when the screen widens into the table,
 * and one chosen from a header shows up on the chip.
 *
 * The chip names the active sort, so a list that looks out of order says why
 * before anybody opens anything. The options are a `.toolbar-popover`: anchored
 * under the chip on a tablet, a bottom sheet on a phone.
 *
 * `.dash-mobile-only` sits on the wrapper here rather than at each call site,
 * because this chip has no meaning beside a table's own headers.
 */

export default function MobileSortMenu<T>({
  table,
  labels = {},
}: {
  table: Table<T>;
  /**
   * What to call a column whose header is not a plain string. A header drawn
   * as JSX has no text TanStack can hand back.
   */
  labels?: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
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

  const nameOf = (column: Column<T, unknown>) => {
    const header = column.columnDef.header;
    return labels[column.id] ?? (typeof header === 'string' ? header : column.id);
  };

  const columns = table.getAllLeafColumns().filter(column => column.getCanSort());
  const active = table.getState().sorting[0];
  const activeColumn = active ? table.getColumn(active.id) : undefined;

  if (columns.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative dash-mobile-only">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="btn-filter whitespace-nowrap"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={
          activeColumn
            ? `Sort: ${nameOf(activeColumn)}, ${active.desc ? 'descending' : 'ascending'}`
            : 'Sort'
        }
      >
        <ArrowUpDown size={16} aria-hidden="true" />
        {activeColumn ? (
          <>
            <span>
              Sort: <span className="text-white">{nameOf(activeColumn)}</span>
            </span>
            {active.desc ? (
              <ArrowDown size={14} className="text-white" aria-hidden="true" />
            ) : (
              <ArrowUp size={14} className="text-white" aria-hidden="true" />
            )}
          </>
        ) : (
          'Sort'
        )}
      </button>

      {isOpen && (
        <div
          role="group"
          aria-label="Sort the list"
          className="toolbar-popover absolute left-0 mt-2 w-72 bg-[#050505] border border-white/10 rounded-md p-2 z-50 shadow-2xl"
        >
          <p className="m-0 px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wider text-secondary">
            Sort by
          </p>
          <ul className="m-0 p-0 list-none flex flex-col">
            {columns.map(column => {
              const sorted = column.getIsSorted();
              const name = nameOf(column);
              return (
                <li key={column.id} className="flex items-center justify-between gap-3 px-2 py-1">
                  <span className={`min-w-0 text-sm ${sorted ? 'text-white font-medium' : 'text-gray-300'}`}>
                    {name}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    {([false, true] as const).map(desc => {
                      const isOn = sorted === (desc ? 'desc' : 'asc');
                      return (
                        <button
                          key={desc ? 'desc' : 'asc'}
                          type="button"
                          aria-pressed={isOn}
                          aria-label={`${name}, ${desc ? 'descending' : 'ascending'}`}
                          onClick={() => {
                            column.toggleSorting(desc);
                            setIsOpen(false);
                          }}
                          className={`flex items-center justify-center gap-1 h-8 px-2.5 rounded-md border text-xs transition-colors cursor-pointer max-sm:min-w-11 ${
                            isOn
                              ? 'border-white/30 bg-white/10 text-white'
                              : 'border-white/10 bg-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {desc ? <ArrowDown size={14} aria-hidden="true" /> : <ArrowUp size={14} aria-hidden="true" />}
                          {desc ? 'Desc' : 'Asc'}
                        </button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>

          {activeColumn && (
            <button
              type="button"
              onClick={() => {
                table.resetSorting(true);
                setIsOpen(false);
              }}
              className="mt-1 w-full flex items-center px-2 py-1.5 rounded-md text-sm text-gray-400 bg-transparent border-0 border-t border-white/5 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
            >
              Clear sort
            </button>
          )}
        </div>
      )}
    </div>
  );
}
