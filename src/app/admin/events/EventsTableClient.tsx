"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, Filter, Eye, X, Columns, Plus,
  ChevronLeft, ChevronRight, ChevronFirst, ChevronLast, ChevronUp, ChevronDown, Check
} from 'lucide-react';
import Link from 'next/link';
import EventActionsMenu from './EventActionsMenu';
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
  VisibilityState,
} from '@tanstack/react-table';

interface EventsTableClientProps {
  events: any[];
}

export default function EventsTableClient({ events }: EventsTableClientProps) {
  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);

  const viewRef = useRef<HTMLDivElement>(null);
  const pageSizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
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

  const columns = useMemo<ColumnDef<any>[]>(() => [
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
      accessorKey: "title",
      header: "Event Name",
      cell: ({ row }) => <span className="font-medium text-primary">{row.original.title}</span>,
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => row.original.date,
    },
    {
      id: "categories",
      header: "Categories",
      accessorFn: (row) => row.categories?.length || 0,
      cell: ({ row }) => `${row.original.categories?.length || 0} categories`,
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) => row.original.location,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => <EventActionsMenu eventId={row.original.id} />,
      enableSorting: false,
      enableHiding: false,
    },
  ], []);

  const table = useReactTable({
    data: events,
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
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="flex flex-col gap-4 w-full text-white">
      {/* Top Toolbar */}
      <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={16} />
            <input
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="search-input"
              placeholder="Search events by name or location..."
            />
            {globalFilter && (
              <button 
                onClick={() => setGlobalFilter('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-300 bg-transparent border-none cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          <div ref={viewRef} className="relative view-dropdown-container">
            <button 
              onClick={() => setIsViewOpen(!isViewOpen)}
              className="btn-filter"
            >
              <Columns size={16} /> View
            </button>
            {isViewOpen && (
              <div className="absolute right-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
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
                      <span className="capitalize">{column.id === 'title' ? 'Event Name' : column.id}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="toolbar-actions">
          <Link href="/admin/events/new" className="flex items-center gap-2 border border-white/10 rounded-md h-10 px-4 text-sm text-zinc-200 bg-transparent hover:bg-white/5 transition-all">
            <Plus size={16} /> Create Event
          </Link>
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
                    className={`py-4 px-4 text-gray-400 font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'title' ? 'pl-8' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
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
                    <TableCell key={cell.id} className={`py-4 px-4 text-white ${cell.column.id === 'title' ? 'pl-8' : ''}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-16 text-center text-gray-500">
                  No events found. Create one to get started.
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
