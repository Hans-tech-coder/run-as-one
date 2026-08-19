'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Trophy, User, Hash, ChevronDown, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  ColumnDef,
  flexRender
} from '@tanstack/react-table';

interface Result {
  id: string;
  name: string;
  bibNumber: string;
  gender: string;
  category: { id: string, name: string };
  chipTime: string;
  gunTime?: string | null;
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

// Custom Action Menu using transitions-dev
function ActionMenu({ eventId, resultId }: { eventId: string, resultId: string }) {
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
    setTimeout(() => setIsClosing(false), 150);
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
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
        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-secondary hover:text-white"
        title="Actions"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>

      <div 
        className={`t-dropdown absolute top-full right-0 mt-2 w-40 bg-[#1a1a20] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden ${isOpen ? 'is-open' : ''} ${isClosing ? 'is-closing' : ''}`}
        data-origin="top-right"
      >
        <div className="p-1">
          <Link
            href={`/events/${eventId}/results/${resultId}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-left block px-3 py-2 text-sm text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            View Details
          </Link>
          <Link
            href={`/events/${eventId}/results/${resultId}?cert=1`}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-left block px-3 py-2 text-sm text-accent-blue font-medium rounded-lg hover:bg-white/5 transition-colors"
          >
            View E-Cert
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function FullResultsClient({ results, event }: Props) {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get('category');
  
  // Find the category name corresponding to the ID if the param exists
  const initialCategoryName = useMemo(() => {
    if (!categoryParam) return null;
    const matchedResult = results.find(r => r.category.id === categoryParam);
    return matchedResult ? matchedResult.category.name : null;
  }, [categoryParam, results]);

  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const columns = useMemo<ColumnDef<Result>[]>(() => [
    {
      id: "index",
      header: "No.",
      cell: ({ row, table }) => {
        const index = table.getSortedRowModel().flatRows.indexOf(row);
        return <div className="text-secondary font-mono">{index + 1}</div>;
      },
    },
    {
      accessorKey: "name",
      header: "Runner",
      cell: ({ row }) => (
        <div>
          <div className="font-bold text-white group-hover/row:text-accent-blue transition-colors">
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
      accessorKey: "categoryRank",
      header: "Category Rank",
      cell: ({ row }) => <span className="font-mono text-white">#{row.original.categoryRank}</span>,
    },
    {
      accessorKey: "genderRank",
      header: "Gender Rank",
      cell: ({ row }) => <span className="font-mono text-white">#{row.original.genderRank}</span>,
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
    {
      accessorKey: "gunTime",
      header: "Gun Time",
      cell: ({ row }) => <span className="font-mono text-secondary">{row.original.gunTime || '-'}</span>,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        return <ActionMenu eventId={event.id} resultId={row.original.id} />;
      },
    }
  ], [event.id]);

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
      columnFilters: initialCategoryName ? [{ id: 'category', value: [initialCategoryName] }] : [],
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
        <div className="hidden md:block relative rounded-[24px] bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] mb-8 overflow-hidden group hover:border-white/[0.12] transition-colors duration-500">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-accent-blue/5 rounded-full blur-[100px] pointer-events-none"></div>
          
          <div className="relative z-10 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] bg-black/40">
                  {table.getFlatHeaders().map((header) => {
                    if (header.id === 'gender') return null; // Hide raw gender column on desktop (merged with name)
                    return (
                      <th key={header.id} className="p-5 text-xs font-bold text-secondary uppercase tracking-[0.1em]">
                        {header.isPlaceholder ? null : header.column.columnDef.header as React.ReactNode}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className={`t-stagger ${mounted ? 'is-shown' : ''}`}>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-secondary/50 italic font-medium">
                      No results found matching your filters.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row, i) => {
                    return (
                      <tr 
                        key={row.id} 
                        className="group/row border-b border-white/[0.03] hover:bg-white/[0.04] transition-colors duration-300 cursor-pointer"
                        onClick={() => window.location.href = `/events/${event.id}/results/${row.original.id}`}
                      >
                        {row.getVisibleCells().map((cell) => {
                          if (cell.column.id === 'gender') return null;
                          return (
                            <td key={cell.id} className="p-5 align-middle">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
          <div className="bg-black/30 border border-white/5 p-8 rounded-[20px] text-center text-secondary/70 italic">No results found matching your filters.</div>
        ) : (
          table.getRowModel().rows.map((row, i) => (
            <div 
              key={row.id} 
              onClick={() => window.location.href = `/events/${event.id}/results/${row.original.id}`}
              className={`block no-underline t-stagger-line t-stagger-line--${(i % 4) + 1}`}
            >
              <div className="relative rounded-[20px] bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] p-5 hover:border-accent-blue/30 hover:bg-white/[0.06] transition-all duration-300 group/row cursor-pointer overflow-hidden">
                <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-accent-blue/5 rounded-full blur-[50px] -mr-16 -mt-16 pointer-events-none"></div>
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-white font-bold text-sm shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
                      {row.index + (table.getState().pagination.pageIndex * table.getState().pagination.pageSize) + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg group-hover/row:text-accent-blue transition-colors leading-tight">{row.original.name}</h3>
                      <div className="text-[11px] text-secondary flex items-center gap-2 mt-1.5 font-medium tracking-wide uppercase">
                        <span className="flex items-center gap-1"><Hash size={11} className="text-accent-blue/70" /> {row.original.bibNumber}</span>
                        <span className="flex items-center gap-1"><User size={11} className="text-accent-blue/70" /> {row.original.gender}</span>
                      </div>
                    </div>
                  </div>
                  <div className="-mt-1 -mr-2">
                    <ActionMenu eventId={event.id} resultId={row.original.id} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3 text-xs relative z-10">
                  <div>
                    <span className="text-secondary block mb-0.5">Category Rank</span>
                    <span className="font-mono text-white">#{row.original.categoryRank}</span>
                  </div>
                  <div>
                    <span className="text-secondary block mb-0.5">Gender Rank</span>
                    <span className="font-mono text-white">#{row.original.genderRank}</span>
                  </div>
                </div>
                
                <div className="flex items-end justify-between border-t border-white/5 pt-3">
                  <span className="bg-accent-blue/10 text-accent-blue px-2 py-1 rounded-md text-[10px] font-bold border border-accent-blue/30">
                    {row.original.category.name}
                  </span>
                  <div className="text-right flex items-center gap-4">
                    {row.original.gunTime && (
                      <div className="text-right">
                        <span className="text-[10px] text-secondary block">Gun Time</span>
                        <span className="font-mono text-secondary text-xs">{row.original.gunTime}</span>
                      </div>
                    )}
                    <div className="text-right">
                      <span className="text-[10px] text-secondary block">Chip Time</span>
                      <span className="font-mono font-bold text-white group-hover/row:text-accent-blue transition-colors text-sm">{row.original.chipTime}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
