'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, Trophy, User, Hash, ChevronDown, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef
} from '@tanstack/react-table';

interface Result {
  id: string;
  name: string;
  bibNumber: string;
  gender: string;
  category: { name: string };
  chipTime: string;
  categoryRank?: number;
  genderRank?: number;
}

interface Props {
  results: Result[];
  event: any;
}

// Custom Dropdown Component using transitions-dev
function FilterDropdown({ title, options, selected, onToggle }: { title: string, options: string[], selected: string[], onToggle: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const close = () => {
    if (!isOpen) return;
    setIsOpen(false);
    setIsClosing(true);
    setTimeout(() => setIsClosing(false), 150); // Matches --dropdown-close-dur
  };

  const toggle = () => {
    if (isOpen) {
      close();
    } else {
      setIsClosing(false);
      setIsOpen(true);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={toggle}
        className="flex items-center gap-2 bg-dark/50 border border-white/10 px-4 py-2 rounded-lg text-sm hover:border-accent-blue/50 transition-colors"
      >
        {title} {selected.length > 0 && <span className="bg-accent-blue text-white text-[10px] px-1.5 py-0.5 rounded-full">{selected.length}</span>}
        <ChevronDown size={14} className={`transition-transform duration-[250ms] ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <div 
        className={`t-dropdown absolute top-full left-0 mt-2 w-56 bg-[#1a1a20] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        data-origin="top-left"
      >
        <div className="max-h-60 overflow-y-auto p-2 scrollbar-thin">
          {options.length === 0 && <div className="p-2 text-xs text-secondary">No options</div>}
          {options.map(opt => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className="w-full text-left flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className={isSelected ? 'text-accent-blue font-medium' : 'text-secondary'}>{opt}</span>
                {isSelected && <Check size={14} className="text-accent-blue" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
}

export default function FullResultsClient({ results, event }: Props) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const columns = useMemo<ColumnDef<Result>[]>(() => [
    {
      id: "rank",
      header: "Rank",
      cell: ({ row }) => (
        <div className="w-8 h-8 rounded-full bg-dark flex items-center justify-center border border-gray-800 text-secondary font-bold text-sm">
          {row.index + (table.getState().pagination.pageIndex * table.getState().pagination.pageSize) + 1}
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Runner",
      cell: ({ row }) => (
        <div>
          <div className="font-bold text-white group-hover:text-accent-blue transition-colors">
            {row.original.name}
          </div>
          <div className="text-xs text-secondary mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1"><Hash size={12} /> {row.original.bibNumber}</span>
            <span className="flex items-center gap-1"><User size={12} /> {row.original.gender}</span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "category",
      accessorFn: (row) => row.category.name,
      header: "Category",
      cell: ({ row }) => (
        <span className="bg-accent-blue/10 text-accent-blue px-2 py-1 rounded-full text-xs font-bold border border-accent-blue/30">
          {row.original.category.name}
        </span>
      ),
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "gender",
      header: "Gender",
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "chipTime",
      header: "Chip Time",
      cell: ({ row }) => <span className="font-mono font-bold text-lg">{row.original.chipTime}</span>,
    },
  ], []);

  // Set up TanStack Table
  const table = useReactTable({
    data: results,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      return (
        row.original.name.toLowerCase().includes(search) ||
        row.original.bibNumber.toLowerCase().includes(search)
      );
    },
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

  const uniqueCategories = useMemo(() => Array.from(new Set(results.map(r => r.category.name))).sort(), [results]);
  const uniqueGenders = useMemo(() => Array.from(new Set(results.map(r => r.gender).filter(Boolean))).sort(), [results]);

  const selectedCategories = (table.getColumn('category')?.getFilterValue() as string[]) || [];
  const selectedGenders = (table.getColumn('gender')?.getFilterValue() as string[]) || [];

  const toggleCategory = (cat: string) => {
    const newSelected = selectedCategories.includes(cat) ? selectedCategories.filter(c => c !== cat) : [...selectedCategories, cat];
    table.getColumn('category')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const toggleGender = (gen: string) => {
    const newSelected = selectedGenders.includes(gen) ? selectedGenders.filter(g => g !== gen) : [...selectedGenders, gen];
    table.getColumn('gender')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [pageSizeClosing, setPageSizeClosing] = useState(false);
  
  const togglePageSize = () => {
    if (pageSizeOpen) {
      setPageSizeOpen(false);
      setPageSizeClosing(true);
      setTimeout(() => setPageSizeClosing(false), 150);
    } else {
      setPageSizeClosing(false);
      setPageSizeOpen(true);
    }
  };

  return (
    <div className="w-full">
      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-center">
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="text-secondary" size={18} />
          </div>
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search runners or bib..."
            className="w-full bg-dark/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-accent-blue transition-colors text-sm"
          />
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <FilterDropdown title="Category" options={uniqueCategories} selected={selectedCategories} onToggle={toggleCategory} />
          <FilterDropdown title="Gender" options={uniqueGenders} selected={selectedGenders} onToggle={toggleGender} />
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block glass-panel rounded-2xl overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-dark/30">
                {table.getFlatHeaders().map((header) => {
                  if (header.id === 'gender') return null; // Hide raw gender column on desktop (merged with name)
                  return (
                    <th key={header.id} className="p-4 text-xs font-medium text-secondary uppercase tracking-wider">
                      {header.isPlaceholder ? null : header.column.columnDef.header as React.ReactNode}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className={`t-stagger ${mounted ? 'is-shown' : ''}`}>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-secondary">
                    No results found.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, i) => {
                  return (
                    <tr 
                      key={row.id} 
                      className="group border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => window.location.href = `/events/${event.id}/results/${row.original.id}`}
                    >
                      {row.getVisibleCells().map((cell) => {
                        if (cell.column.id === 'gender') return null;
                        return (
                          <td key={cell.id} className="p-4 align-middle">
                            {cell.column.columnDef.cell(cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className={`md:hidden flex flex-col gap-3 mb-6 t-stagger ${mounted ? 'is-shown' : ''}`}>
        {table.getRowModel().rows.length === 0 ? (
          <div className="glass-panel p-8 rounded-xl text-center text-secondary">No results found.</div>
        ) : (
          table.getRowModel().rows.map((row, i) => (
            <Link 
              key={row.id} 
              href={`/events/${event.id}/results/${row.original.id}`} 
              className={`block no-underline t-stagger-line t-stagger-line--${(i % 4) + 1}`}
            >
              <div className="glass-panel p-5 rounded-xl hover:border-accent-blue transition-colors group">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-dark flex items-center justify-center border border-gray-800 text-secondary font-bold text-xs">
                      {row.index + (table.getState().pagination.pageIndex * table.getState().pagination.pageSize) + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-white group-hover:text-accent-blue transition-colors">{row.original.name}</h3>
                      <div className="text-[11px] text-secondary flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1"><Hash size={10} /> {row.original.bibNumber}</span>
                        <span className="flex items-center gap-1"><User size={10} /> {row.original.gender}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-between border-t border-white/5 pt-3">
                  <span className="bg-accent-blue/10 text-accent-blue px-2 py-1 rounded-md text-[10px] font-bold border border-accent-blue/30">
                    {row.original.category.name}
                  </span>
                  <div className="text-right">
                    <span className="text-[10px] text-secondary block">Chip Time</span>
                    <span className="font-mono font-bold text-white group-hover:text-accent-blue transition-colors">{row.original.chipTime}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-12">
        <div className="flex items-center gap-3 text-sm text-secondary">
          <span>Rows per page:</span>
          <div className="relative">
            <button onClick={togglePageSize} className="flex items-center gap-1 bg-dark px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 transition-colors">
              {table.getState().pagination.pageSize}
              <ChevronDown size={14} className={`transition-transform ${pageSizeOpen ? 'rotate-180' : ''}`} />
            </button>
            <div 
              className={`t-dropdown absolute bottom-full left-0 mb-2 w-24 bg-[#1a1a20] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden ${pageSizeOpen ? 'is-open' : ''} ${pageSizeClosing ? 'is-closing' : ''}`}
              data-origin="bottom-left"
            >
              {[10, 25, 50, 100].map(size => (
                <button
                  key={size}
                  onClick={() => { table.setPageSize(size); togglePageSize(); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 ${table.getState().pagination.pageSize === size ? 'text-accent-blue font-medium bg-white/5' : 'text-white'}`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-secondary">
            Page <span className="font-medium text-white">{table.getState().pagination.pageIndex + 1}</span> of{' '}
            <span className="font-medium text-white">{table.getPageCount() || 1}</span>
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded-lg bg-dark border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded-lg bg-dark border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
