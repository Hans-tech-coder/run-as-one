"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Columns } from 'lucide-react';
import { flexRender, type Row, type Table as TanStackTable } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SkeletonBar } from '@/components/ui/Skeleton';

/**
 * The events table's desktop frame, for any TanStack screen (PROJECT_GUIDE §9,
 * "One admin table"): the bordered, rounded box, gray sortable headers with
 * their chevrons, 16px cells, the hairline between rows and the empty line.
 *
 * Events, registrants, results, marketing and team still draw this inline —
 * they came first. Clients, communities, feedback, remittances and a race's
 * settlement were hand-rolled `.data-table`s until they moved onto TanStack,
 * and they share this one copy instead of adding five more.
 *
 * Only the `lg`-up body. The toolbar above, the card list below `lg` and
 * `AdminTablePager` under both stay on the screen, reading the same table
 * instance.
 */
export default function AdminDataTable<T>({
  table,
  empty,
  loading = false,
  leadColumn,
  cellClassName,
  rowProps,
  renderSubRow,
}: {
  table: TanStackTable<T>;
  /** The line an empty list shows. */
  empty: React.ReactNode;
  /** A screen that fetches its own rows draws placeholder rows until they arrive (§9). */
  loading?: boolean;
  /** The column that takes the 32px inset on the left, as Event Name does. */
  leadColumn?: string;
  /** Extra classes for one column's cells (widths, `align-top`). */
  cellClassName?: (columnId: string) => string | undefined;
  /** A row that opens something: its click, keyboard and name. */
  rowProps?: (row: Row<T>) => React.HTMLAttributes<HTMLTableRowElement>;
  /** A row that opens in place: a second row under it, as the voucher batches do. */
  renderSubRow?: (row: Row<T>) => React.ReactNode;
}) {
  const columnCount = table.getVisibleLeafColumns().length;
  const rows = table.getRowModel().rows;
  const inset = (columnId: string) => (columnId === leadColumn ? 'pl-8' : '');

  return (
    <div className="dash-desktop-only border border-white/10 rounded-lg overflow-hidden bg-transparent">
      <Table>
        <TableHeader className="bg-transparent">
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id} className="border-b border-white/10 hover:bg-transparent">
              {headerGroup.headers.map(header => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={`py-4 px-4 text-gray-400 font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${inset(header.column.id)}`}
                >
                  <div className="flex items-center gap-2">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: <ChevronUp className="w-3.5 h-3.5" />,
                      desc: <ChevronDown className="w-3.5 h-3.5" />,
                    }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            [0, 1, 2, 3, 4].map(index => (
              <TableRow key={index} className="border-b border-white/5 hover:bg-transparent">
                {table.getVisibleLeafColumns().map(column => (
                  <TableCell key={column.id} className={`py-4 px-4 ${inset(column.id)}`}>
                    <SkeletonBar className="h-4" style={{ width: `${70 - (index % 3) * 12}%` }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length > 0 ? (
            rows.map(row => {
              const props = rowProps?.(row) ?? {};
              const subRow = renderSubRow?.(row);
              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    {...props}
                    className={`border-b border-white/5 hover:bg-white/5 transition-colors ${props.className ?? ''}`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell
                        key={cell.id}
                        className={`py-4 px-4 text-white ${inset(cell.column.id)} ${cellClassName?.(cell.column.id) ?? ''}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {subRow && (
                    <TableRow className="border-b border-white/5 hover:bg-transparent">
                      <TableCell colSpan={columnCount} className="bg-black/30 px-8 py-4">
                        {subRow}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-16 text-center text-gray-500">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The toolbar's View chip: which columns the table shows. Desktop only, since
 * cards have no columns — below `lg` the screen's `MobileSortMenu` stands in.
 * The same menu events draws inline.
 */
export function AdminColumnsMenu<T>({
  table,
  labels = {},
}: {
  table: TanStackTable<T>;
  /** What to call a column whose header is not a plain string. */
  labels?: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
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

  return (
    <div ref={ref} className="relative view-dropdown-container dash-desktop-only">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="btn-filter"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Columns size={16} /> View
      </button>
      {isOpen && (
        <div className="toolbar-popover absolute right-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
          {table.getAllLeafColumns().filter(column => column.getCanHide()).map(column => {
            const header = column.columnDef.header;
            const name = labels[column.id] ?? (typeof header === 'string' ? header : column.id);
            return (
              <label key={column.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md text-sm text-white">
                <div className={`w-4 h-4 border border-white/10 rounded-sm flex items-center justify-center ${column.getIsVisible() ? 'bg-white/10' : ''}`}>
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                    className="opacity-0 absolute w-0 h-0"
                  />
                  {column.getIsVisible() && <div className="w-2 h-2 bg-white rounded-sm" />}
                </div>
                <span>{name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A row's place in the sorted list, for a `No.` column and the card beside it.
 * Counted by id, not object identity: sorting rebuilds the rows (§9).
 */
export function rowPosition<T>(sortedRows: Row<T>[], row: Row<T>) {
  return sortedRows.findIndex(sorted => sorted.id === row.id) + 1;
}
