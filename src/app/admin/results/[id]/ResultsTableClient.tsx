'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Columns, ChevronUp, ChevronDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import FiltersMenu from '../../FiltersMenu';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import ResultsUploaderClient from './ResultsUploaderClient';
import AdminTablePager from '../../AdminTablePager';
import MobileSortMenu from '../../MobileSortMenu';
import { compareCategoryNames } from '@/lib/category-distance';
import RunnerCards from './RunnerCards';
import { runnerColumns, runnerSearchFilter } from './runner-columns';
import type { RunnerRow } from './runner-row';

interface ResultsTableClientProps {
  results: RunnerRow[];
  event?: any;
}

/**
 * The organizer's race results — the admin's one table (PROJECT_GUIDE §9) from
 * `lg` up, and below it the card list reading the same TanStack rows, so the
 * search, the Filters chip, sort, selection and the page stay one
 * state across a resize.
 */
export default function ResultsTableClient({ results, event }: ResultsTableClientProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const [isViewOpen, setIsViewOpen] = useState(false);

  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (viewRef.current && !viewRef.current.contains(event.target as Node)) {
        setIsViewOpen(false);
      }
    }
    // On a phone the menu is a sheet along the bottom edge, well away from
    // the chip that opened it, so Escape has to close it as well.
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsViewOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const columns = useMemo(runnerColumns, []);

  const table = useReactTable({
    data: results,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: runnerSearchFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      }
    }
  });

  const uniqueCategories = useMemo(() => {
    const cats = new Set(results.map(r => r.category.name));
    return Array.from(cats).sort(compareCategoryNames);
  }, [results]);

  const uniqueGenders = useMemo(() => {
    const gens = new Set(results.map(r => r.gender).filter(Boolean));
    return Array.from(gens).sort();
  }, [results]);

  const selectedCategories = (table.getColumn('category')?.getFilterValue() as string[]) || [];
  const selectedGenders = (table.getColumn('gender')?.getFilterValue() as string[]) || [];

  const toggleCategory = (cat: string) => {
    const newSelected = selectedCategories.includes(cat)
      ? selectedCategories.filter(c => c !== cat)
      : [...selectedCategories, cat];
    table.getColumn('category')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const toggleGender = (gen: string) => {
    const newSelected = selectedGenders.includes(gen)
      ? selectedGenders.filter(g => g !== gen)
      : [...selectedGenders, gen];
    table.getColumn('gender')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const sortedRows = table.getSortedRowModel().flatRows;

  return (
    <div className="flex flex-col gap-4 w-full text-primary">
      {/* Top Toolbar */}
      <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>

          {/* Search Input */}
          <div className="search-wrapper">
            <Search className="search-icon" size={16} />
            <input
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="search-input"
              placeholder="Filter by name or bib..."
            />
          </div>

          <FiltersMenu
            groups={[
              { label: 'Category', options: uniqueCategories, selected: selectedCategories, onToggle: toggleCategory },
              { label: 'Gender', options: uniqueGenders, selected: selectedGenders, onToggle: toggleGender },
            ]}
            onClear={() => {
              table.getColumn('category')?.setFilterValue(undefined);
              table.getColumn('gender')?.setFilterValue(undefined);
            }}
            empty="Nothing to filter yet. The categories and genders appear here once results are uploaded."
          />

          {/* Which columns the table shows. Cards have no columns to hide, so
              below `lg` the chip goes and Sort (which the headers did) comes. */}
          <div ref={viewRef} className="relative view-dropdown-container dash-desktop-only">
            <button
              onClick={() => setIsViewOpen(!isViewOpen)}
              className="btn-filter"
            >
              <Columns size={16} /> View
            </button>
            {isViewOpen && (
              <div className="toolbar-popover absolute left-0 mt-2 bg-[var(--dash-popover)] border border-[var(--dash-border)] rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                {table.getAllLeafColumns().filter(col => col.getCanHide()).map(column => {
                  return (
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
                      <span className="capitalize">{column.id}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <MobileSortMenu table={table} />
        </div>

        <div className="toolbar-actions">
          {event && <ResultsUploaderClient event={event} />}
        </div>
      </div>

      {/* Table Area — from `lg` up; the cards below take its place under it. */}
      <div className="dash-desktop-only border border-[var(--dash-border)] rounded-lg overflow-hidden bg-transparent">
        <Table>
          <TableHeader className="bg-transparent">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className="border-b border-[var(--dash-border)] hover:bg-transparent">
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`py-4 px-4 text-secondary font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'index' ? 'pl-8' : ''}`}
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} className="border-b border-[var(--dash-hairline)] hover:bg-[var(--ink-05)] transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className={`py-4 px-4 text-primary ${cell.column.id === 'index' ? 'pl-8' : ''}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-16 text-center text-[var(--text-muted)]">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* The same rows as the table above, below `lg`. */}
      <div className="dash-mobile-only">
        <RunnerCards rows={table.getRowModel().rows} sortedRows={sortedRows} />
      </div>

      <AdminTablePager table={table} />
    </div>
  );
}
