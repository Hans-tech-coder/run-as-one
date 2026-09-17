'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Columns, ChevronUp, ChevronDown, Check } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import FiltersMenu from '../../../FiltersMenu';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  Row,
  SortingState,
  FilterFn,
  VisibilityState,
} from '@tanstack/react-table';
import ResultsUploaderClient from './ResultsUploaderClient';
import AdminCardList from '../../../AdminCardList';
import AdminTablePager from '../../../AdminTablePager';
import MobileSortMenu from '../../../MobileSortMenu';
import { toWholeSeconds } from '@/lib/race-time';

interface Result {
  id: string;
  overallRank: number;
  categoryRank: number;
  genderRank: number;
  bibNumber: string;
  name: string;
  gender: string;
  category: { name: string };
  chipTime: string;
  gunTime: string | null;
}

interface ResultsTableClientProps {
  results: Result[];
  event?: any;
}

const globalSearchFilterFn: FilterFn<Result> = (row, columnId, filterValue) => {
  const searchableRowContent = `${row.original.name} ${row.original.bibNumber}`.toLowerCase();
  const searchTerm = (filterValue ?? "").toLowerCase();
  return searchableRowContent.includes(searchTerm);
};

/**
 * A row's place in the sorted list, for the No. column and the card beside it.
 * Counted by id rather than object identity (PROJECT_GUIDE §9): sorting rebuilds
 * the rows, so an `indexOf` on them finds nothing.
 */
function rowPosition<T>(sortedRows: Row<T>[], row: Row<T>) {
  return sortedRows.findIndex(sorted => sorted.id === row.id) + 1;
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

  const columns = useMemo<ColumnDef<Result>[]>(() => [
    {
      id: "select",
      header: ({ table }) => {
        const isChecked = table.getIsAllPageRowsSelected();
        return (
          <div className="flex items-center justify-center px-1 w-8">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={table.getToggleAllPageRowsSelectedHandler()}
                className="appearance-none w-4 h-4 rounded border border-white/20 bg-transparent checked:bg-white checked:border-white cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              {isChecked && <Check className="absolute text-black pointer-events-none" size={12} strokeWidth={3} />}
            </div>
          </div>
        );
      },
      cell: ({ row }) => {
        const isChecked = row.getIsSelected();
        return (
          <div className="flex items-center justify-center px-1 w-8">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={row.getToggleSelectedHandler()}
                className="appearance-none w-4 h-4 rounded border border-white/20 bg-transparent checked:bg-white checked:border-white cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              {isChecked && <Check className="absolute text-black pointer-events-none" size={12} strokeWidth={3} />}
            </div>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "index",
      header: "No.",
      cell: ({ row, table }) => (
        <span className="text-gray-400 font-mono">{rowPosition(table.getSortedRowModel().flatRows, row)}</span>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="font-medium text-gray-200">{row.original.name}</span>,
    },
    {
      accessorKey: "bibNumber",
      header: "Bib Number",
      cell: ({ row }) => <span className="text-gray-400">{row.original.bibNumber}</span>,
    },
    {
      id: "category",
      accessorFn: (row) => row.category.name,
      header: "Category",
      cell: ({ row }) => <span className="text-gray-400">{row.original.category.name}</span>,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "gender",
      header: "Gender",
      cell: ({ row }) => <span className="text-gray-400">{row.original.gender}</span>,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "categoryRank",
      header: "Category Rank",
      cell: ({ row }) => <span className="text-gray-400">#{row.original.categoryRank}</span>,
    },
    {
      accessorKey: "genderRank",
      header: "Gender Rank",
      cell: ({ row }) => <span className="text-gray-400">#{row.original.genderRank}</span>,
    },
    {
      accessorKey: "chipTime",
      header: "Chip Time",
      cell: ({ row }) => <span className="text-gray-400">{toWholeSeconds(row.original.chipTime)}</span>,
    },
    {
      accessorKey: "gunTime",
      header: "Gun Time",
      cell: ({ row }) => <span className="text-gray-400">{row.original.gunTime ? toWholeSeconds(row.original.gunTime) : '-'}</span>,
    },
  ], []);

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
    globalFilterFn: globalSearchFilterFn,
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
    return Array.from(cats).sort();
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
    <div className="flex flex-col gap-4 w-full text-white">
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
              <div className="toolbar-popover absolute left-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                {table.getAllLeafColumns().filter(col => col.getCanHide()).map(column => {
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
      <div className="dash-desktop-only border border-white/10 rounded-lg overflow-hidden bg-transparent">
        <Table>
          <TableHeader className="bg-transparent">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className="border-b border-white/10 hover:bg-transparent">
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`py-4 px-4 text-gray-400 font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'index' ? 'pl-8' : ''}`}
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
                <TableRow key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className={`py-4 px-4 text-white ${cell.column.id === 'index' ? 'pl-8' : ''}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-16 text-center text-gray-500">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* The same rows as the table above (AdminCardList). A finisher's name is
          untrusted length, so it truncates on its line rather than holding the
          card open; the bib is a chip beside nothing, and the times go through
          toWholeSeconds exactly as the cells do. */}
      <div className="dash-mobile-only">
        <AdminCardList
          items={table.getRowModel().rows}
          getKey={row => row.id}
          label="Race results"
          className="is-flush"
          selection={{
            isSelected: row => row.getIsSelected(),
            toggle: row => row.toggleSelected(),
            label: row => `Select ${row.original.name}`,
          }}
          leading={row => <span className="font-mono">{rowPosition(sortedRows, row)}</span>}
          title={row => <span className="block truncate">{row.original.name}</span>}
          badges={row =>
            row.original.bibNumber ? (
              <span className="status-badge neutral">Bib {row.original.bibNumber}</span>
            ) : null
          }
          fields={row => [
            { label: 'Category', value: row.original.category.name },
            { label: 'Gender', value: row.original.gender || '-' },
            { label: 'Category Rank', value: `#${row.original.categoryRank}` },
            { label: 'Gender Rank', value: `#${row.original.genderRank}` },
            { label: 'Chip Time', value: <span className="tabular-nums">{toWholeSeconds(row.original.chipTime)}</span> },
            {
              label: 'Gun Time',
              value: row.original.gunTime
                ? <span className="tabular-nums">{toWholeSeconds(row.original.gunTime)}</span>
                : '-',
            },
          ]}
          empty={
            <div className="border border-white/10 rounded-lg py-16 px-4 text-center text-gray-500">
              No results.
            </div>
          }
        />
      </div>

      <AdminTablePager table={table} />
    </div>
  );
}
