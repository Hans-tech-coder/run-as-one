'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Columns, ChevronUp, ChevronDown, Trash2, X } from 'lucide-react';
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
import AddRunnerButton from './AddRunnerButton';
import AdminTablePager from '../../AdminTablePager';
import MobileSortMenu from '../../MobileSortMenu';
import { compareCategoryNames } from '@/lib/category-distance';
import RunnerCards from './RunnerCards';
import { runnerColumns, runnerSearchFilter } from './runner-columns';
import type { RunnerRow } from './runner-row';
import RowActionsMenu from '../../RowActionsMenu';
import { useRunnerActions } from './use-runner-actions';

interface ResultsTableClientProps {
  results: RunnerRow[];
  event?: any;
  /** `results:manage` on this race: the row menu (RESULTS_ROW_ACTIONS_PLAN.md). */
  canManage?: boolean;
}

/**
 * The organizer's race results — the admin's one table (PROJECT_GUIDE §9) from
 * `lg` up, and below it the card list reading the same TanStack rows, so the
 * search, the Filters chip, sort, selection and the page stay one
 * state across a resize.
 */
export default function ResultsTableClient({ results, event, canManage = false }: ResultsTableClientProps) {
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

  const runnerActions = useRunnerActions({
    id: event?.id ?? '',
    slug: event?.slug ?? '',
    resultsOnly: Boolean(event?.resultsOnly),
    categories: event?.categories ?? [],
  });

  // Null rather than an empty menu for a row with nothing to offer, so a
  // card does not draw an empty footer for it.
  const renderActions = (row: RunnerRow, className = '') => {
    const actions = runnerActions.actionsFor(row);
    return actions.length > 0 ? <RowActionsMenu label={row.name} actions={actions} className={className} /> : null;
  };

  // Every row offers *Edit details* to someone who may manage the results
  // (RESULTS_ROW_ACTIONS_PLAN.md Batch 3), on any race.
  const showActions = canManage;

  // The menu reads nothing that changes between renders but the row itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => runnerColumns(showActions ? row => renderActions(row) : undefined), [showActions]);

  const table = useReactTable({
    data: results,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
    // Selected by result id, not by position, so a refresh that adds or
    // removes a row can never leave a different runner ticked.
    getRowId: row => row.id,
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

  // *Delete Selected* (RESULTS_ROW_ACTIONS_PLAN.md Batch 5): the red chip from
  // `lg` up, the bulk bar below it, both only with `results:manage`.
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = canManage ? selectedRows.length : 0;
  const deleteSelected = async () => {
    if (await runnerActions.deleteResults(selectedRows.map(row => row.original))) setRowSelection({});
  };
  // What the bar last counted, so it still reads "3 selected" while it fades
  // out rather than dropping to 0 (the registrants bar's own pattern).
  const [bulkBarCount, setBulkBarCount] = useState(0);
  if (selectedCount > 0 && selectedCount !== bulkBarCount) {
    setBulkBarCount(selectedCount);
  }

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
          {selectedCount > 0 && (
            <button type="button" onClick={deleteSelected} className="btn-filter is-danger is-active dash-desktop-only">
              <Trash2 size={16} /> Delete Selected ({selectedCount})
            </button>
          )}
          {event && canManage && <AddRunnerButton event={event} />}
          {event && <ResultsUploaderClient
            event={event}
            byHand={{
              added: results.filter(r => r.byHand === 'ADDED').length,
              edited: results.filter(r => r.byHand === 'EDITED').length,
            }}
          />}
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
        <RunnerCards
          rows={table.getRowModel().rows}
          sortedRows={sortedRows}
          renderActions={showActions ? renderActions : undefined}
          selectAll={{
            checked: table.getIsAllPageRowsSelected(),
            toggle: () => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected()),
            label: `Select all ${table.getRowModel().rows.length} on this page`,
          }}
        />
      </div>

      <AdminTablePager table={table} />

      {/* The bulk bar, below `lg`, while rows are selected; from `lg` up the
          red chip in the toolbar does this. No export here (`.is-no-export`). */}
      {canManage && (
        <>
          <div className="bulk-bar-spacer dash-mobile-only" hidden={selectedCount === 0} aria-hidden="true" />
          <div className="dash-mobile-only">
            <div
              role="region"
              aria-label="Selected results"
              className={`bulk-bar is-no-export t-toast ${selectedCount > 0 ? 'is-open' : ''}`}
            >
              <span className="bulk-bar-count" aria-live="polite">{bulkBarCount} selected</span>
              <button type="button" onClick={deleteSelected} className="btn-filter is-danger bulk-bar-delete">
                <Trash2 size={16} aria-hidden="true" /> Delete
              </button>
              <button type="button" onClick={() => setRowSelection({})} className="btn-filter bulk-bar-clear">
                <X size={16} aria-hidden="true" /> Clear
              </button>
            </div>
          </div>
        </>
      )}

      {runnerActions.modal}
    </div>
  );
}
