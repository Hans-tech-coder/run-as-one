"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, Filter, Download, Eye, X, 
  ChevronLeft, ChevronRight, ChevronFirst, ChevronLast, Columns, ChevronUp, ChevronDown, CheckCircle, Check
} from 'lucide-react';
import RegistrantActionsMenu from './RegistrantActionsMenu';
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

interface RegistrantsTableProps {
  eventId: string;
  runners: any[];
}

export default function RegistrantsTable({ eventId, runners: initialRunners }: RegistrantsTableProps) {
  const [runners, setRunners] = useState(initialRunners);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [viewingRunner, setViewingRunner] = useState<any | null>(null);
  
  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isLogisticsOpen, setIsLogisticsOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const viewRef = useRef<HTMLDivElement>(null);
  const pageSizeRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const logisticsRef = useRef<HTMLDivElement>(null);
  const paymentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (viewRef.current && !viewRef.current.contains(event.target as Node)) setIsViewOpen(false);
      if (pageSizeRef.current && !pageSizeRef.current.contains(event.target as Node)) setIsPageSizeOpen(false);
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) setIsCategoryOpen(false);
      if (logisticsRef.current && !logisticsRef.current.contains(event.target as Node)) setIsLogisticsOpen(false);
      if (paymentRef.current && !paymentRef.current.contains(event.target as Node)) setIsPaymentOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleStatusChange = async (registrationId: string, newStatus: string) => {
    setUpdatingId(registrationId);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setRunners(runners.map(r => r.registrationId === registrationId ? { ...r, status: newStatus } : r));
      } else {
        console.error('Failed to update status');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

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
      accessorKey: "orderRef",
      header: "Order Ref",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-secondary">
          {row.original.orderRef}
          <button 
            onClick={() => setViewingRunner(row.original)}
            className="icon-btn"
            title="View Details"
          >
            <Eye size={16} />
          </button>
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="font-medium text-primary">
          <div>{row.original.name}</div>
          <div className="text-xs text-secondary font-normal">{row.original.email}</div>
        </div>
      ),
      filterFn: (row, id, value) => {
        const rowValue = `${row.original.name} ${row.original.email}`.toLowerCase();
        return rowValue.includes((value as string).toLowerCase());
      }
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => row.original.category,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }) => row.original.size,
    },
    {
      accessorKey: "logisticsMethod",
      header: "Logistics",
      cell: ({ row }) => <span className="capitalize">{row.original.logisticsMethod}</span>,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "paymentMethod",
      header: "Payment",
      cell: ({ row }) => (
        <span className="capitalize">
          {row.original.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : row.original.paymentMethod}
        </span>
      ),
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(row.getValue(columnId));
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className={`status-badge ${row.original.status === 'PAID' ? 'success' : 'pending'}`}>
          {row.original.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="action-dropdown-container">
          <RegistrantActionsMenu 
            runnerId={row.original.id}
            registrationId={row.original.registrationId}
            status={row.original.status}
            paymentMethod={row.original.paymentMethod || ''}
            updatingId={updatingId}
            handleStatusChange={handleStatusChange}
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ], [updatingId]);

  const table = useReactTable({
    data: runners,
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

  const uniqueCategories = useMemo(() => {
    const cats = new Set(runners.map(r => r.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [runners]);

  const uniqueLogistics = useMemo(() => {
    const logs = new Set(runners.map(r => r.logisticsMethod).filter(Boolean));
    return Array.from(logs).sort();
  }, [runners]);

  const uniquePayment = useMemo(() => {
    const pays = new Set(runners.map(r => r.paymentMethod).filter(Boolean));
    return Array.from(pays).sort();
  }, [runners]);

  const selectedCategories = (table.getColumn('category')?.getFilterValue() as string[]) || [];
  const selectedLogistics = (table.getColumn('logisticsMethod')?.getFilterValue() as string[]) || [];
  const selectedPayment = (table.getColumn('paymentMethod')?.getFilterValue() as string[]) || [];

  const toggleCategory = (cat: string) => {
    const newSelected = selectedCategories.includes(cat)
      ? selectedCategories.filter(c => c !== cat)
      : [...selectedCategories, cat];
    table.getColumn('category')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const toggleLogistics = (log: string) => {
    const newSelected = selectedLogistics.includes(log)
      ? selectedLogistics.filter(l => l !== log)
      : [...selectedLogistics, log];
    table.getColumn('logisticsMethod')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const togglePayment = (pay: string) => {
    const newSelected = selectedPayment.includes(pay)
      ? selectedPayment.filter(p => p !== pay)
      : [...selectedPayment, pay];
    table.getColumn('paymentMethod')?.setFilterValue(newSelected.length ? newSelected : undefined);
  };

  const handleExportCSV = () => {
    const headers = [
      'Order Ref', 'First Name', 'Last Name', 'Email', 'Phone', 'Gender', 'Birthdate', 
      'Category', 'Distance', 'Singlet Size', 'Emergency Contact', 'Emergency Phone', 
      'Medical Conditions', 'Logistics Method', 'Delivery Address', 'Payment Method', 'Status'
    ];
    
    // Use filtered data from table
    const csvRows = table.getFilteredRowModel().rows.map(r => {
      const runner = r.original;
      return [
        runner.orderRef, runner.firstName, runner.lastName, runner.email, runner.phone, runner.gender, runner.birthdate,
        runner.category, runner.distance, runner.size, runner.emergencyContactName, runner.emergencyContactPhone,
        `"${runner.medicalConditions}"`, runner.logisticsMethod, `"${runner.deliveryAddress}"`, runner.paymentMethod, runner.status
      ].join(',')
    });
    
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `registrants_event_${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
              placeholder="Search runners..."
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

          {/* Category Filter */}
          <div ref={categoryRef} className="relative view-dropdown-container">
            <button 
              onClick={() => setIsCategoryOpen(!isCategoryOpen)}
              className="btn-filter"
            >
              <Filter size={16} /> Category
              {selectedCategories.length > 0 && <span className="ml-1 px-1 bg-white/10 rounded">{selectedCategories.length}</span>}
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

          {/* Logistics Filter */}
          <div ref={logisticsRef} className="relative view-dropdown-container">
            <button 
              onClick={() => setIsLogisticsOpen(!isLogisticsOpen)}
              className="btn-filter"
            >
              <Filter size={16} /> Logistics
              {selectedLogistics.length > 0 && <span className="ml-1 px-1 bg-white/10 rounded">{selectedLogistics.length}</span>}
            </button>
            {isLogisticsOpen && (
              <div className="absolute left-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                {uniqueLogistics.map(log => {
                  const isSelected = selectedLogistics.includes(log);
                  return (
                    <div 
                      key={log}
                      className={`flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md text-sm text-white capitalize ${isSelected ? 'bg-white/5' : ''}`}
                      onClick={() => toggleLogistics(log)}
                    >
                      <div className={`w-4 h-4 border border-white/10 rounded-sm flex items-center justify-center ${isSelected ? 'bg-white/10' : ''}`}>
                        {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                      </div>
                      {log}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Filter */}
          <div ref={paymentRef} className="relative view-dropdown-container">
            <button 
              onClick={() => setIsPaymentOpen(!isPaymentOpen)}
              className="btn-filter"
            >
              <Filter size={16} /> Payment
              {selectedPayment.length > 0 && <span className="ml-1 px-1 bg-white/10 rounded">{selectedPayment.length}</span>}
            </button>
            {isPaymentOpen && (
              <div className="absolute left-0 mt-2 bg-[#050505] border border-white/10 rounded-md p-2 min-w-[150px] z-50 shadow-2xl">
                {uniquePayment.map(pay => {
                  const isSelected = selectedPayment.includes(pay);
                  const displayPay = pay === 'bank_transfer' ? 'Bank Transfer' : pay;
                  return (
                    <div 
                      key={pay}
                      className={`flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md text-sm text-white capitalize ${isSelected ? 'bg-white/5' : ''}`}
                      onClick={() => togglePayment(pay)}
                    >
                      <div className={`w-4 h-4 border border-white/10 rounded-sm flex items-center justify-center ${isSelected ? 'bg-white/10' : ''}`}>
                        {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                      </div>
                      {displayPay}
                    </div>
                  );
                })}
              </div>
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
                      <span className="capitalize">{column.id === 'orderRef' ? 'Order Ref' : column.id}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="toolbar-actions">
          <button onClick={handleExportCSV} className="btn-filter">
            <Download size={16} /> Export to CSV
          </button>
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
                    className={`py-4 px-4 text-gray-400 font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'orderRef' ? 'pl-8' : ''}`}
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
                    <TableCell key={cell.id} className={`py-4 px-4 text-white ${cell.column.id === 'orderRef' ? 'pl-8' : ''}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-16 text-center text-gray-500">
                  No registrants found.
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

      {viewingRunner && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h3 className="text-xl font-semibold text-white">Registrant Details</h3>
              <button onClick={() => setViewingRunner(null)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Runner Info</h4>
                  <div className="space-y-2 text-sm">
                    <p className="flex flex-col"><span className="text-gray-500">Name</span> <span className="text-white font-medium">{viewingRunner.name}</span></p>
                    <p className="flex flex-col"><span className="text-gray-500">Email</span> <span className="text-white font-medium">{viewingRunner.email}</span></p>
                    <p className="flex flex-col"><span className="text-gray-500">Phone</span> <span className="text-white font-medium">{viewingRunner.phone}</span></p>
                    <p className="flex flex-col"><span className="text-gray-500">Gender</span> <span className="text-white font-medium capitalize">{viewingRunner.gender}</span></p>
                    <p className="flex flex-col"><span className="text-gray-500">Birthdate</span> <span className="text-white font-medium">{viewingRunner.birthdate}</span></p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Race Details</h4>
                  <div className="space-y-2 text-sm">
                    <p className="flex flex-col"><span className="text-gray-500">Category</span> <span className="text-white font-medium">{viewingRunner.category}</span></p>
                    <p className="flex flex-col"><span className="text-gray-500">Distance</span> <span className="text-white font-medium">{viewingRunner.distance}</span></p>
                    <p className="flex flex-col"><span className="text-gray-500">Singlet Size</span> <span className="text-white font-medium">{viewingRunner.size}</span></p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 pt-8 border-t border-white/10">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Emergency Contact</h4>
                  <div className="space-y-2 text-sm">
                    <p className="flex flex-col"><span className="text-gray-500">Name</span> <span className="text-white font-medium">{viewingRunner.emergencyContactName}</span></p>
                    <p className="flex flex-col"><span className="text-gray-500">Phone</span> <span className="text-white font-medium">{viewingRunner.emergencyContactPhone}</span></p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Medical Info</h4>
                  <div className="text-sm text-white font-medium whitespace-pre-wrap">{viewingRunner.medicalConditions || 'None provided'}</div>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/10 space-y-4">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Transaction Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <p className="flex flex-col"><span className="text-gray-500">Order Ref</span> <span className="text-white font-medium">{viewingRunner.orderRef}</span></p>
                  <p className="flex flex-col"><span className="text-gray-500">Status</span> 
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit mt-1 ${viewingRunner.status === 'PAID' ? 'bg-green-500/20 text-green-400 border border-green-500/20' : 'bg-orange-500/20 text-orange-400 border border-orange-500/20'}`}>
                      {viewingRunner.status}
                    </span>
                  </p>
                  <p className="flex flex-col"><span className="text-gray-500">Payment Method</span> <span className="text-white font-medium capitalize">{viewingRunner.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : viewingRunner.paymentMethod}</span></p>
                  <p className="flex flex-col"><span className="text-gray-500">Logistics</span> <span className="text-white font-medium capitalize">{viewingRunner.logisticsMethod}</span></p>
                  {viewingRunner.logisticsMethod === 'delivery' && (
                    <p className="flex flex-col sm:col-span-2"><span className="text-gray-500">Address</span> <span className="text-white font-medium">{viewingRunner.deliveryAddress}</span></p>
                  )}
                  {viewingRunner.paymentMethod === 'bank_transfer' && viewingRunner.transactionNumber && (
                    <p className="flex flex-col"><span className="text-gray-500">Transaction No.</span> <span className="text-white font-medium">{viewingRunner.transactionNumber}</span></p>
                  )}
                </div>
                  
                {viewingRunner.paymentMethod === 'bank_transfer' && (
                  <div className="mt-6">
                    <p className="text-gray-500 text-sm mb-2">Proof of Payment</p>
                    {viewingRunner.proofOfPayment ? (
                      <div className="rounded-lg overflow-hidden border border-white/10 max-h-[300px] flex items-center justify-center bg-black/50">
                        <img 
                          src={viewingRunner.proofOfPayment} 
                          alt="Proof of Payment" 
                          className="max-w-full max-h-[300px] object-contain"
                        />
                      </div>
                    ) : (
                      <div className="border border-dashed border-white/20 rounded-lg p-8 flex flex-col items-center justify-center text-gray-500">
                        <Eye size={24} className="mb-2 opacity-50" />
                        <p className="text-sm">No image attached yet</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6 border-t border-white/10 flex justify-between items-center bg-black/20">
              <div>
                {viewingRunner.status === 'PENDING' && viewingRunner.paymentMethod === 'bank_transfer' && (
                  <button 
                    onClick={() => {
                      handleStatusChange(viewingRunner.registrationId, 'PAID');
                      setViewingRunner({ ...viewingRunner, status: 'PAID' });
                    }}
                    disabled={updatingId === viewingRunner.registrationId}
                    className="flex items-center gap-2 bg-gradient-to-r from-[#FF6B00] to-[#007AFF] text-white px-4 py-2 rounded-md font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {updatingId === viewingRunner.registrationId ? 'Validating...' : 'Validate Payment'}
                  </button>
                )}
              </div>
              <button 
                onClick={() => setViewingRunner(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
