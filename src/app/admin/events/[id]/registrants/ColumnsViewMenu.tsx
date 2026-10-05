"use client";

/**
 * The toolbar's View chip: which columns the table shows. One copy for both
 * tabs of the registrants screen, the Registrants table and the Unpaid
 * checkouts table, so the two pick columns the same way.
 *
 * From `lg` up only. Cards have no columns to hide, so below `lg` the chip
 * goes and the Sort chip (which the headers did) takes its place.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Columns } from 'lucide-react';
import type { Column, Table } from '@tanstack/react-table';

export default function ColumnsViewMenu<T>({ table }: { table: Table<T> }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // The header's own words where it is a plain string, so the menu and the
  // table name a column the same way.
  const nameOf = (column: Column<T, unknown>) => {
    const header = column.columnDef.header;
    return typeof header === 'string' ? header : column.id;
  };

  return (
    <div ref={ref} className="relative view-dropdown-container dash-desktop-only">
      <button onClick={() => setIsOpen(!isOpen)} className="btn-filter">
        <Columns size={16} /> View
      </button>
      {isOpen && (
        <div className="toolbar-popover absolute right-0 mt-2 bg-[var(--dash-popover)] border border-[var(--dash-border)] rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
          {table.getAllLeafColumns().filter(col => col.getCanHide()).map(column => (
            <label key={column.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--ink-05)] cursor-pointer rounded-md text-sm text-primary">
              <div className={`w-4 h-4 border border-[var(--dash-border)] rounded-sm flex items-center justify-center ${column.getIsVisible() ? 'bg-[var(--ink-10)]' : ''}`}>
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                  className="opacity-0 absolute w-0 h-0"
                />
                {column.getIsVisible() && <div className="w-2 h-2 bg-[var(--ink)] rounded-sm" />}
              </div>
              <span className="capitalize">{nameOf(column)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
