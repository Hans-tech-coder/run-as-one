"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, Filter, Download, Eye, X, Trash2,
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

  // Edit Modal State
  const [editingRunner, setEditingRunner] = useState<any | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isEditClosing, setIsEditClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Delete Modal State
  const [deletingRunner, setDeletingRunner] = useState<any | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleteClosing, setIsDeleteClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk Delete Modal State
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleteClosing, setIsBulkDeleteClosing] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
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

  const openEditModal = (runnerId: string) => {
    const runner = runners.find(r => r.id === runnerId);
    if (runner) {
      setEditingRunner({ ...runner });
      setIsEditOpen(true);
    }
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
    setIsEditClosing(true);
    setTimeout(() => {
      setIsEditClosing(false);
      setEditingRunner(null);
    }, 150);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRunner) return;
    
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/runners/${editingRunner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRunner),
      });
      
      if (res.ok) {
        const updatedRunnerData = await res.json();
        // The API returns the updated runner. We need to merge it carefully
        setRunners(runners.map(r => r.id === editingRunner.id ? { 
          ...r, 
          name: `${updatedRunnerData.firstName} ${updatedRunnerData.lastName}`,
          email: updatedRunnerData.email,
          size: updatedRunnerData.singletSize,
          runningCommunity: updatedRunnerData.runningCommunity,
          // Preserve other original properties like orderRef, amount, status which belong to Registration
        } : r));
        closeEditModal();
      } else {
        alert('Failed to update runner');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred while updating runner');
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteModal = (runnerId: string) => {
    const runner = runners.find(r => r.id === runnerId);
    if (runner) {
      setDeletingRunner(runner);
      setIsDeleteOpen(true);
    }
  };

  const closeDeleteModal = () => {
    setIsDeleteOpen(false);
    setIsDeleteClosing(true);
    setTimeout(() => {
      setIsDeleteClosing(false);
      setDeletingRunner(null);
    }, 150);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRunner) return;
    
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/runners/${deletingRunner.id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setRunners(runners.filter(r => r.id !== deletingRunner.id));
        closeDeleteModal();
      } else {
        alert('Failed to delete runner');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred while deleting runner');
    } finally {
      setIsDeleting(false);
    }
  };

  const closeBulkDeleteModal = () => {
    setIsBulkDeleteOpen(false);
    setIsBulkDeleteClosing(true);
    setTimeout(() => {
      setIsBulkDeleteClosing(false);
    }, 150);
  };

  const handleBulkDeleteConfirm = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    if (selectedRows.length === 0) return;
    
    const runnerIds = selectedRows.map(row => row.original.id);
    
    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/admin/runners/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerIds })
      });
      
      if (res.ok) {
        setRunners(runners.filter(r => !runnerIds.includes(r.id)));
        setRowSelection({});
        closeBulkDeleteModal();
      } else {
        alert('Failed to delete selected runners');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred while deleting runners');
    } finally {
      setIsBulkDeleting(false);
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
            onEdit={openEditModal}
            onDelete={openDeleteModal}
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
      'Running Community', 'Medical Conditions', 'Logistics Method', 'Delivery Area', 'Delivery Address', 'Payment Method', 'Status'
    ];
    
    // Use selected rows if any, otherwise fallback to all filtered rows
    const selectedRows = table.getSelectedRowModel().rows;
    const rowsToExport = selectedRows.length > 0 ? selectedRows : table.getFilteredRowModel().rows;

    const csvRows = rowsToExport.map(r => {
      const runner = r.original;
      return [
        runner.orderRef, runner.firstName, runner.lastName, runner.email, runner.phone, runner.gender, runner.birthdate,
        runner.category, runner.distance, runner.size, runner.emergencyContactName, runner.emergencyContactPhone,
        `"${runner.runningCommunity || ''}"`, `"${runner.medicalConditions}"`, runner.logisticsMethod, runner.deliveryZone, `"${runner.deliveryAddress}"`, runner.paymentMethod, runner.status
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

        <div className="toolbar-actions flex items-center gap-2">
          {table.getSelectedRowModel().rows.length > 0 && (
            <button 
              onClick={() => setIsBulkDeleteOpen(true)} 
              className="btn-filter bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 hover:text-red-400"
            >
              <Trash2 size={16} /> Delete Selected ({table.getSelectedRowModel().rows.length})
            </button>
          )}
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
                    {/* Fun-run packages have none, and a blank row reads like
                        missing data rather than an absent field. */}
                    {viewingRunner.distance && <p className="flex flex-col"><span className="text-gray-500">Distance</span> <span className="text-white font-medium">{viewingRunner.distance}</span></p>}
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
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Running Community</h4>
                  <div className="text-sm text-white font-medium">{viewingRunner.runningCommunity || 'Independent Runner'}</div>
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
                  {viewingRunner.logisticsMethod === 'delivery' && viewingRunner.deliveryZone && (
                    <p className="flex flex-col"><span className="text-gray-500">Delivery Area</span> <span className="text-white font-medium">{viewingRunner.deliveryZone === 'outside' ? 'Outside Province' : 'Inside Province'}</span></p>
                  )}
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
                        {/*
                          Receipts are private blobs — there is no permanently valid
                          URL for one. This route checks that the logged-in admin owns
                          the event, then redirects to a short-lived signed URL.
                        */}
                        <img
                          src={`/api/admin/proof/${viewingRunner.registrationId}`}
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

      {/* Edit Modal */}
      <div 
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isEditOpen && !isEditClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div 
          className={`t-modal w-full max-w-2xl bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isEditOpen ? 'is-open' : ''} ${isEditClosing ? 'is-closing' : ''}`}
        >
          <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0">
            <h3 className="text-xl font-semibold text-white">Edit Registrant</h3>
            <button onClick={closeEditModal} className="text-gray-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto">
            {editingRunner && (
              <form id="edit-runner-form" onSubmit={handleEditSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">First Name</label>
                    <input 
                      type="text" 
                      required 
                      value={editingRunner.firstName || ''} 
                      onChange={e => setEditingRunner({...editingRunner, firstName: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Last Name</label>
                    <input 
                      type="text" 
                      required 
                      value={editingRunner.lastName || ''} 
                      onChange={e => setEditingRunner({...editingRunner, lastName: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Email</label>
                    <input 
                      type="email" 
                      required 
                      value={editingRunner.email || ''} 
                      onChange={e => setEditingRunner({...editingRunner, email: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Phone</label>
                    <input 
                      type="text" 
                      required 
                      value={editingRunner.phone || ''} 
                      onChange={e => setEditingRunner({...editingRunner, phone: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Gender</label>
                    <select 
                      value={editingRunner.gender || ''} 
                      onChange={e => setEditingRunner({...editingRunner, gender: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Birthdate</label>
                    <input 
                      type="date" 
                      required 
                      value={editingRunner.birthdate || ''} 
                      onChange={e => setEditingRunner({...editingRunner, birthdate: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Singlet Size</label>
                    <select 
                      value={editingRunner.singletSize || ''} 
                      onChange={e => setEditingRunner({...editingRunner, singletSize: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30"
                    >
                      <option value="XS">XS</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="2XL">2XL</option>
                    </select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-sm text-gray-400">Running Community</label>
                    <input
                      type="text"
                      value={editingRunner.runningCommunity || ''}
                      onChange={e => setEditingRunner({...editingRunner, runningCommunity: e.target.value})}
                      placeholder="Independent Runner"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <h4 className="text-white font-medium mb-4">Emergency Contact</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Contact Name</label>
                      <input 
                        type="text" 
                        required 
                        value={editingRunner.emergencyContactName || ''} 
                        onChange={e => setEditingRunner({...editingRunner, emergencyContactName: e.target.value})}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-gray-400">Contact Phone</label>
                      <input 
                        type="text" 
                        required 
                        value={editingRunner.emergencyContactPhone || ''} 
                        onChange={e => setEditingRunner({...editingRunner, emergencyContactPhone: e.target.value})}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30" 
                      />
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>

          <div className="p-6 border-t border-white/10 flex justify-end gap-3 shrink-0 bg-black/20">
            <button 
              type="button" 
              onClick={closeEditModal} 
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              form="edit-runner-form"
              disabled={isSaving}
              className="px-6 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <div 
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isDeleteOpen && !isDeleteClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div 
          className={`t-modal w-full max-w-md bg-[#111] border border-red-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isDeleteOpen ? 'is-open' : ''} ${isDeleteClosing ? 'is-closing' : ''}`}
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-semibold text-white">Delete Registrant</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Are you sure you want to delete {deletingRunner?.name}? This action cannot be undone and will permanently remove them from the database.
            </p>
          </div>
          
          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <button 
              type="button" 
              onClick={closeDeleteModal} 
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="button" 
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Delete Confirmation Modal */}
      <div 
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isBulkDeleteOpen && !isBulkDeleteClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div 
          className={`t-modal w-full max-w-md bg-[#111] border border-red-500/20 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 ${isBulkDeleteOpen ? 'is-open' : ''} ${isBulkDeleteClosing ? 'is-closing' : ''}`}
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-semibold text-white">Delete Selected Registrants</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Are you sure you want to delete the {table.getSelectedRowModel().rows.length} selected registrants? This action cannot be undone and will permanently remove them from the database.
            </p>
          </div>
          
          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <button 
              type="button" 
              onClick={closeBulkDeleteModal} 
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="button" 
              onClick={handleBulkDeleteConfirm}
              disabled={isBulkDeleting}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
