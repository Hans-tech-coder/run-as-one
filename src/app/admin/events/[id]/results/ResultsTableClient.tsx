'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ChevronLeft, ChevronRight, ChevronFirst, ChevronLast, 
  Search, X, Filter, Columns, Plus, ChevronUp, ChevronDown, Check
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
  FilterFn,
  VisibilityState,
} from '@tanstack/react-table';
import ResultsUploaderClient from './ResultsUploaderClient';

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

export default function ResultsTableClient({ results, event }: ResultsTableClientProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isGenderOpen, setIsGenderOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const categoryRef = useRef<HTMLDivElement>(null);
  const genderRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const pageSizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
      }
      if (genderRef.current && !genderRef.current.contains(event.target as Node)) {
        setIsGenderOpen(false);
      }
      if (viewRef.current && !viewRef.current.contains(event.target as Node)) {
        setIsViewOpen(false);
      }
      if (pageSizeRef.current && !pageSizeRef.current.contains(event.target as Node)) {
        setIsPageSizeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      cell: ({ row, table }) => {
        const index = table.getSortedRowModel().flatRows.indexOf(row);
        return <span className="text-gray-400 font-mono">{index + 1}</span>;
      },
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
      cell: ({ row }) => <span className="text-gray-400">{row.original.chipTime}</span>,
    },
    {
      accessorKey: "gunTime",
      header: "Gun Time",
      cell: ({ row }) => <span className="text-gray-400">{row.original.gunTime || '-'}</span>,
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

          {/* Category Filter Dropdown */}
          <div ref={categoryRef} className="relative view-dropdown-container">
            <button 
              onClick={() => setIsCategoryOpen(!isCategoryOpen)}
              className="btn-filter"
            >
              <Filter size={16} />
              Category
              {selectedCategories.length > 0 && (
                <span className="ml-1 px-1 bg-white/10 rounded">
                  {selectedCategories.length}
                </span>
              )}
            </button>
            {isCategoryOpen && (
              <div className="absolute left-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                {uniqueCategories.map(cat => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <div 
                      key={cat}
                      className={`flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md text-sm text-white ${isSelected ? 'bg-white/5' : ''}`}
                      onClick={() => toggleCategory(cat)}
                    >
                      <div className={`w-4 h-4 border border-white/10 rounded-sm flex items-center justify-center ${isSelected ? 'bg-white/10' : ''}`}>
                        {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                      </div>
                      {cat}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Gender Filter Dropdown */}
          <div ref={genderRef} className="relative view-dropdown-container">
            <button 
              onClick={() => setIsGenderOpen(!isGenderOpen)}
              className="btn-filter"
            >
              <Filter size={16} />
              Gender
              {selectedGenders.length > 0 && (
                <span className="ml-1 px-1 bg-white/10 rounded">
                  {selectedGenders.length}
                </span>
              )}
            </button>
            {isGenderOpen && (
              <div className="absolute left-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                {uniqueGenders.map(gen => {
                  const isSelected = selectedGenders.includes(gen);
                  return (
                    <div 
                      key={gen}
                      className={`flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md text-sm text-white ${isSelected ? 'bg-white/5' : ''}`}
                      onClick={() => toggleGender(gen)}
                    >
                      <div className={`w-4 h-4 border border-white/10 rounded-sm flex items-center justify-center ${isSelected ? 'bg-white/10' : ''}`}>
                        {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                      </div>
                      {gen}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column Visibility Dropdown */}
          <div ref={viewRef} className="relative view-dropdown-container">
            <button 
              onClick={() => setIsViewOpen(!isViewOpen)}
              className="btn-filter"
            >
              <Columns size={16} /> View
            </button>
            {isViewOpen && (
              <div className="absolute left-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
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
        </div>

        <div className="toolbar-actions">
          {event && <ResultsUploaderClient event={event} />}
        </div>
      </div>

      {/* Table Area */}
      <div className="border border-white/10 rounded-lg overflow-hidden bg-transparent">
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

      {/* Pagination Controls */}
      <div className="flex justify-between items-center flex-wrap gap-4 mt-1">
        <div className="flex items-center gap-3 text-white text-sm font-medium">
          <span className="text-secondary">Rows per page</span>
          
          <div ref={pageSizeRef} className="relative">
            <button
              onClick={() => setIsPageSizeOpen(!isPageSizeOpen)}
              className="flex items-center gap-3 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white bg-transparent hover:bg-white/5 transition-colors cursor-pointer"
            >
              {table.getState().pagination.pageSize}
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            
            {isPageSizeOpen && (
              <div className="absolute bottom-[calc(100%+4px)] left-0 bg-[#050505] border border-white/10 rounded-md p-1 min-w-[80px] z-50 shadow-2xl">
                {[5, 10, 25, 50].map(pageSize => (
                  <div
                    key={pageSize}
                    className={`flex items-center justify-between px-3 py-1.5 cursor-pointer rounded-md text-sm transition-colors ${table.getState().pagination.pageSize === pageSize ? 'bg-white/5 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                    onClick={() => {
                      table.setPageSize(pageSize);
                      setIsPageSizeOpen(false);
                    }}
                  >
                    <span>{pageSize}</span>
                    {table.getState().pagination.pageSize === pageSize && <Check size={14} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-white text-sm font-medium">
            {table.getFilteredRowModel().rows.length === 0 ? '0-0 of 0' : 
             `${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-${Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of ${table.getFilteredRowModel().rows.length}`}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
              className="flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronFirst className="w-4 h-4" />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
              className="flex items-center justify-center w-8 h-8 border border-white/10 rounded-md bg-transparent text-gray-400 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLast className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

