'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, ChevronFirst, ChevronLast, 
  Search, X, Filter, Columns, Plus, ChevronUp, ChevronDown, Check, Settings
} from 'lucide-react';
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
  
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  
  const categoryRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
      }
      if (viewRef.current && !viewRef.current.contains(event.target as Node)) {
        setIsViewOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const columns = useMemo<ColumnDef<Result>[]>(() => [
    {
      id: "index",
      header: "#",
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
    },
    {
      accessorKey: "categoryRank",
      header: "Overall Rank",
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
    },
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

  const selectedCategories = (table.getColumn('category')?.getFilterValue() as string[]) || [];

  const toggleCategory = (cat: string) => {
    const newSelected = selectedCategories.includes(cat)
      ? selectedCategories.filter(c => c !== cat)
      : [...selectedCategories, cat];
    table.getColumn('category')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    padding: '0.375rem 0.75rem',
    fontSize: '0.875rem',
    color: '#a1a1aa',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.2s'
  };

  const popoverStyle = {
    position: 'absolute' as const,
    top: '100%',
    left: '0',
    marginTop: '0.5rem',
    backgroundColor: '#0a0a0a',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    padding: '0.5rem',
    minWidth: '150px',
    zIndex: 50,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
  };

  const paginationBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#a1a1aa',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', color: '#fff' }}>
      
      {/* Top Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          
          {/* Search Input */}
          <div style={{ position: 'relative', width: '250px' }}>
            <Filter style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: '#71717a' }} />
            <input 
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '0.375rem 0.75rem 0.375rem 2rem',
                fontSize: '0.875rem',
                color: '#fff',
                outline: 'none'
              }}
              placeholder="Filter by name or bib..."
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
            />
          </div>

          {/* Category Filter Dropdown */}
          <div ref={categoryRef} style={{ position: 'relative' }}>
            <button 
              style={buttonStyle}
              onClick={() => setIsCategoryOpen(!isCategoryOpen)}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Filter style={{ width: '14px', height: '14px' }} />
              Category
              {selectedCategories.length > 0 && (
                <span style={{ marginLeft: '4px', padding: '0 4px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                  {selectedCategories.length}
                </span>
              )}
            </button>
            {isCategoryOpen && (
              <div style={popoverStyle}>
                {uniqueCategories.map(cat => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <div 
                      key={cat}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', 
                        cursor: 'pointer', borderRadius: '4px', fontSize: '0.875rem', color: '#e4e4e7',
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.1)' : 'transparent'
                      }}
                      onClick={() => toggleCategory(cat)}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = isSelected ? 'rgba(255,255,255,0.1)' : 'transparent'}
                    >
                      <div style={{ width: '16px', height: '16px', border: '1px solid #52525b', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <Check style={{ width: '12px', height: '12px' }} />}
                      </div>
                      {cat}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column Visibility Dropdown */}
          <div ref={viewRef} style={{ position: 'relative' }}>
            <button 
              style={buttonStyle}
              onClick={() => setIsViewOpen(!isViewOpen)}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Columns style={{ width: '14px', height: '14px' }} />
              View
            </button>
            {isViewOpen && (
              <div style={popoverStyle}>
                {table.getAllLeafColumns().filter(col => col.getCanHide()).map(column => {
                  const isVisible = column.getIsVisible();
                  return (
                    <div 
                      key={column.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', 
                        cursor: 'pointer', borderRadius: '4px', fontSize: '0.875rem', color: '#e4e4e7',
                      }}
                      onClick={() => column.toggleVisibility()}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ width: '16px', height: '16px', border: '1px solid #52525b', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isVisible && <Check style={{ width: '12px', height: '12px' }} />}
                      </div>
                      <span style={{ textTransform: 'capitalize' }}>{column.id}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {event && <ResultsUploaderClient event={event} />}
          <button 
            style={{...buttonStyle, padding: '0.375rem'}}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title="Column Mapping Settings"
          >
            <Settings style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div style={{ 
        border: '1px solid rgba(255, 255, 255, 0.1)', 
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#000000'
      }}>
        {/* Custom scroll wrapper */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                {table.getHeaderGroups().map(headerGroup => (
                  <React.Fragment key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th 
                        key={header.id} 
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ 
                          padding: '0.75rem 1rem', 
                          textAlign: 'left', 
                          color: '#a1a1aa',
                          fontWeight: '500',
                          cursor: header.column.getCanSort() ? 'pointer' : 'default',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: <ChevronUp style={{ width: '14px', height: '14px' }} />,
                            desc: <ChevronDown style={{ width: '14px', height: '14px' }} />,
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      </th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', transition: 'background 0.2s' }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} style={{ padding: '0.75rem 1rem', color: '#e4e4e7' }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} style={{ padding: '4rem', textAlign: 'center', color: '#a1a1aa' }}>
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e4e4e7', fontSize: '0.875rem', fontWeight: '500' }}>
          Rows per page
          <select 
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '0.25rem 1.5rem 0.25rem 0.5rem',
              color: '#e4e4e7',
              outline: 'none',
              appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'rgba(255,255,255,0.5)\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.3rem center',
              backgroundSize: '1rem',
              cursor: 'pointer'
            }}
            value={table.getState().pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
          >
            {[10, 20, 30, 40, 50].map(pageSize => (
              <option key={pageSize} value={pageSize} style={{ backgroundColor: '#0a0a0a' }}>
                {pageSize}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ color: '#e4e4e7', fontSize: '0.875rem', fontWeight: '500' }}>
            {table.getFilteredRowModel().rows.length === 0 ? '0-0 of 0' : 
             `${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-${Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of ${table.getFilteredRowModel().rows.length}`}
          </div>
          
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button 
              style={{...paginationBtnStyle, opacity: !table.getCanPreviousPage() ? 0.5 : 1, cursor: !table.getCanPreviousPage() ? 'not-allowed' : 'pointer'}}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.firstPage()}
              onMouseOver={(e) => !table.getCanPreviousPage() ? null : e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ChevronFirst style={{ width: '16px', height: '16px' }} />
            </button>
            <button 
              style={{...paginationBtnStyle, opacity: !table.getCanPreviousPage() ? 0.5 : 1, cursor: !table.getCanPreviousPage() ? 'not-allowed' : 'pointer'}}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              onMouseOver={(e) => !table.getCanPreviousPage() ? null : e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
            </button>
            <button 
              style={{...paginationBtnStyle, opacity: !table.getCanNextPage() ? 0.5 : 1, cursor: !table.getCanNextPage() ? 'not-allowed' : 'pointer'}}
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              onMouseOver={(e) => !table.getCanNextPage() ? null : e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ChevronRight style={{ width: '16px', height: '16px' }} />
            </button>
            <button 
              style={{...paginationBtnStyle, opacity: !table.getCanNextPage() ? 0.5 : 1, cursor: !table.getCanNextPage() ? 'not-allowed' : 'pointer'}}
              disabled={!table.getCanNextPage()}
              onClick={() => table.lastPage()}
              onMouseOver={(e) => !table.getCanNextPage() ? null : e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ChevronLast style={{ width: '16px', height: '16px' }} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

