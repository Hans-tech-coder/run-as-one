"use client";

/**
 * The registrants screen's desktop table, from `lg` up: one frame, one header
 * row with sort arrows, one row style, for both tabs (the Registrants table
 * and the Unpaid checkouts table). Below `lg` each tab shows its cards
 * instead (AdminCardList).
 *
 * One component rather than a copy per tab (owner, 2026-10-05): the two
 * copies had already drifted, the unpaid one aligning its cells to the top
 * while the registrants one centred them, so the checkbox and the No. sat
 * differently on the two tabs. Each tab keeps its own columns and data; how a
 * row looks is decided here once.
 */

import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { flexRender, type Table as TanStackTable } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { columnInset } from './registrant-columns';

export default function RegistrantsDataTable<T>({
  table,
  empty,
}: {
  table: TanStackTable<T>;
  /** The line shown when no row is left, e.g. "No registrants found." */
  empty: React.ReactNode;
}) {
  const rows = table.getRowModel().rows;

  return (
    <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-hidden bg-transparent">
      <Table>
        <TableHeader className="bg-transparent">
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id} className="border-b border-[var(--dash-border)] hover:bg-transparent">
              {headerGroup.headers.map(header => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={`py-4 px-2.5 text-secondary font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${columnInset(header.column.id)}`}
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
          {rows.length > 0 ? (
            rows.map(row => (
              <TableRow key={row.id} className="border-b border-[var(--dash-hairline)] hover:bg-[var(--ink-05)] transition-colors">
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id} className={`py-4 px-2.5 text-primary ${columnInset(cell.column.id)}`}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="py-16 text-center text-[var(--text-muted)]"
              >
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
