"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, Filter, Download, Eye, X, Trash2,
  ChevronLeft, ChevronRight, ChevronFirst, ChevronLast, Columns, ChevronUp, ChevronDown, CheckCircle, Check,
  MessageSquare, MessageSquareText
} from 'lucide-react';
import RegistrantActionsMenu from './RegistrantActionsMenu';
import { useAlert } from '@/components/ui/AlertProvider';
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
import { SHIRT_SIZES } from '@/lib/shirt-size';
import { upperCaseAsTyped } from '@/lib/text-case';

interface RegistrantsTableProps {
  eventId: string;
  runners: any[];
}

export default function RegistrantsTable({ eventId, runners: initialRunners }: RegistrantsTableProps) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
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

  // Remarks Modal State. The note belongs to the registration, not the
  // runner, so the row is only how the organizer reached it — a group of five
  // shares one note, and the modal says so.
  const [remarkingRunner, setRemarkingRunner] = useState<any | null>(null);
  const [remarksDraft, setRemarksDraft] = useState('');
  const [isRemarksOpen, setIsRemarksOpen] = useState(false);
  const [isRemarksClosing, setIsRemarksClosing] = useState(false);
  const [isSavingRemarks, setIsSavingRemarks] = useState(false);

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

  const runnersOnOrder = (runner: any) =>
    runners.filter(r => r.registrationId === runner.registrationId).length;

  const openRemarksModal = (runnerId: string) => {
    const runner = runners.find(r => r.id === runnerId);
    if (!runner) return;
    setRemarkingRunner(runner);
    setRemarksDraft(runner.remarks || '');
    setIsRemarksOpen(true);
  };

  const closeRemarksModal = () => {
    setIsRemarksOpen(false);
    setIsRemarksClosing(true);
    setTimeout(() => {
      setIsRemarksClosing(false);
      setRemarkingRunner(null);
      setRemarksDraft('');
    }, 150);
  };

  const handleRemarksSave = async () => {
    if (!remarkingRunner) return;
    const registrationId = remarkingRunner.registrationId;
    const text = remarksDraft.trim();

    setIsSavingRemarks(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: text }),
      });

      if (res.ok) {
        const { registration } = await res.json();
        // Every runner on the order carries the same note, so all of their
        // rows are updated — otherwise the icon would light up on one member
        // of a group and stay grey on the other four.
        setRunners(runners.map(r => r.registrationId === registrationId ? {
          ...r,
          remarks: registration.remarks,
          remarksBy: registration.remarksBy,
          remarksAt: registration.remarksAt,
        } : r));
        // The detail modal, if it is the one open behind this, is holding a
        // copy of the row rather than reading it back out of the list.
        setViewingRunner((current: any) =>
          current && current.registrationId === registrationId
            ? {
                ...current,
                remarks: registration.remarks,
                remarksBy: registration.remarksBy,
                remarksAt: registration.remarksAt,
              }
            : current
        );
        closeRemarksModal();
      } else {
        const { error } = await res.json().catch(() => ({ error: '' }));
        alert({
          variant: 'error',
          title: 'Remarks Not Saved',
          message: error || 'The remarks could not be saved. Please try again.',
        });
      }
    } catch (e) {
      console.error(e);
      alert({
        variant: 'error',
        title: 'Remarks Not Saved',
        message: 'Something went wrong while saving the remarks. Please try again.',
      });
    } finally {
      setIsSavingRemarks(false);
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
      // The runner's own reference — the order reference plus their position
      // on it (RM-D918005C-2). Sorting and searching run on this rather than
      // on the bare order reference: it contains the order reference, so
      // looking up a whole group still works, and it keeps the members of a
      // group in their own order instead of an arbitrary one.
      accessorKey: "runnerRef",
      header: "Reference",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-secondary">
          {row.original.runnerRef}
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
      // Already the readable uppercase label; see registrants/page.tsx.
      cell: ({ row }) => <span>{row.original.paymentMethod}</span>,
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
      // Both controls sit at the start of the cell, under the column label,
      // rather than pushed to the row's right edge (PROJECT_GUIDE §8.6).
      cell: ({ row }) => (
        <div className="action-dropdown-container flex items-center gap-1">
          <button
            onClick={() => openRemarksModal(row.original.id)}
            className={`icon-btn ${row.original.remarks ? 'primary' : ''}`}
            title={row.original.remarks ? 'Remarks on file' : 'Add remarks'}
            aria-label={row.original.remarks ? 'Edit remarks' : 'Add remarks'}
          >
            {/* A different icon, not just a different colour: colour alone is
                the one signal a colour-blind organizer cannot read. */}
            {row.original.remarks ? <MessageSquareText size={16} /> : <MessageSquare size={16} />}
          </button>
          <RegistrantActionsMenu 
            runnerId={row.original.id}
            registrationId={row.original.registrationId}
            status={row.original.status}
            isBankTransfer={row.original.isBankTransfer}
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
  ], [updatingId, runners]);

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

  /**
   * The registrants export, written to survive Excel.
   *
   * Three things had to be true and were not:
   *
   *  - **Every field is quoted.** Only some of them used to be, so a runner
   *    named "DELA CRUZ, JR." or a category called "10K, Open" pushed every
   *    following column one to the right for that row alone — the kind of
   *    damage nobody notices until the race-day list is already printed.
   *  - **Phone numbers reach Excel as text.** `+639171234567` bare is read as
   *    a formula, because a leading `+` starts one, and lands in the cell as
   *    the number 639171234567 with the plus gone. The `="…"` form is the one
   *    spelling Excel, Google Sheets and LibreOffice all read back as the
   *    literal string.
   *  - **A UTF-8 BOM leads the file.** Without it Excel opens a UTF-8 CSV as
   *    the system codepage, and the first "Ñ" in a Filipino name arrives as
   *    mojibake.
   *
   * CRLF line endings for the same reason: RFC 4180 asks for them, and Excel
   * is the reader this file exists for.
   */
  const csvField = (value: unknown): string =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;

  const csvPhone = (value: unknown): string => {
    const number = String(value ?? '').replace(/"/g, '');
    return number ? `"=""${number}"""` : csvField('');
  };

  const handleExportCSV = () => {
    const headers = [
      'Runner Ref', 'Order Ref', 'First Name', 'Last Name', 'Email', 'Phone', 'Gender', 'Birthdate', 
      'Category', 'Distance', 'Shirt Size', 'Emergency Contact', 'Emergency Phone', 
      'Running Community', 'Medical Conditions', 'Logistics Method', 'Delivery Area', 'Delivery Address', 'Payment Method', 'Status'
    ];
    
    // Use selected rows if any, otherwise fallback to all filtered rows
    const selectedRows = table.getSelectedRowModel().rows;
    const rowsToExport = selectedRows.length > 0 ? selectedRows : table.getFilteredRowModel().rows;

    const csvRows = rowsToExport.map(r => {
      const runner = r.original;
      return [
        csvField(runner.runnerRef),
        csvField(runner.orderRef),
        csvField(runner.firstName),
        csvField(runner.lastName),
        csvField(runner.email),
        csvPhone(runner.phone),
        csvField(runner.gender),
        csvField(runner.birthdate),
        csvField(runner.category),
        csvField(runner.distance),
        csvField(runner.size),
        csvField(runner.emergencyContactName),
        csvPhone(runner.emergencyContactPhone),
        csvField(runner.runningCommunity),
        csvField(runner.medicalConditions || 'None'),
        csvField(runner.logisticsMethod),
        csvField(runner.deliveryZone),
        csvField(runner.deliveryAddress),
        csvField(runner.paymentMethod),
        csvField(runner.status),
      ].join(',');
    });
    
    const csvContent = [headers.map(csvField).join(','), ...csvRows].join('\r\n');
    // U+FEFF, the byte order mark, spelled out rather than pasted in as the
    // invisible character it is. It has to be the very first thing in the file
    // or Excel reads the rest as the system codepage instead of UTF-8.
    const BOM = String.fromCharCode(0xfeff);
    const blob = new Blob([BOM, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `registrants_event_${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // The blob stays in memory for the life of the document otherwise, and an
    // organizer exports the same list over and over while checking payments.
    // Released on the next tick, not immediately: some browsers have not
    // finished handing the URL to the download manager when click() returns,
    // and revoking under them cancels the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
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
                  return (
                    <div 
                      key={pay}
                      className={`flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md text-sm text-white capitalize ${isSelected ? 'bg-white/5' : ''}`}
                      onClick={() => togglePayment(pay)}
                    >
                      <div className={`w-4 h-4 border border-white/10 rounded-sm flex items-center justify-center ${isSelected ? 'bg-white/10' : ''}`}>
                        {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                      </div>
                      {pay}
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
                      <span className="capitalize">{column.id === 'runnerRef' ? 'Reference' : column.id}</span>
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
                    className={`py-4 px-4 text-gray-400 font-medium h-auto ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''} ${header.column.id === 'runnerRef' ? 'pl-8' : ''}`}
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
                    <TableCell key={cell.id} className={`py-4 px-4 text-white ${cell.column.id === 'runnerRef' ? 'pl-8' : ''}`}>
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
                    <p className="flex flex-col"><span className="text-gray-500">Shirt Size</span> <span className="text-white font-medium">{viewingRunner.size}</span></p>
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
                  <p className="flex flex-col"><span className="text-gray-500">Runner Ref</span> <span className="text-white font-medium">{viewingRunner.runnerRef}</span></p>
                  {/* The order reference is kept beside it: this runner's ref
                      identifies the person, the order ref is what the whole
                      group paid under and what a bank line will match. */}
                  <p className="flex flex-col"><span className="text-gray-500">Order Ref</span> <span className="text-white font-medium">{viewingRunner.orderRef}</span></p>
                  <p className="flex flex-col"><span className="text-gray-500">Status</span> 
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit mt-1 ${viewingRunner.status === 'PAID' ? 'bg-green-500/20 text-green-400 border border-green-500/20' : 'bg-orange-500/20 text-orange-400 border border-orange-500/20'}`}>
                      {viewingRunner.status}
                    </span>
                  </p>
                  <p className="flex flex-col"><span className="text-gray-500">Payment Method</span> <span className="text-white font-medium">{viewingRunner.paymentMethod}</span></p>
                  <p className="flex flex-col"><span className="text-gray-500">Logistics</span> <span className="text-white font-medium">{viewingRunner.logisticsMethod}</span></p>
                  {viewingRunner.isDelivery && viewingRunner.deliveryZone && (
                    <p className="flex flex-col"><span className="text-gray-500">Delivery Area</span> <span className="text-white font-medium">{viewingRunner.deliveryZone}</span></p>
                  )}
                  {viewingRunner.isDelivery && (
                    <p className="flex flex-col sm:col-span-2"><span className="text-gray-500">Address</span> <span className="text-white font-medium">{viewingRunner.deliveryAddress}</span></p>
                  )}
                  {viewingRunner.isBankTransfer && viewingRunner.transactionNumber && (
                    <p className="flex flex-col"><span className="text-gray-500">Transaction No.</span> <span className="text-white font-medium">{viewingRunner.transactionNumber}</span></p>
                  )}
                  <p className="flex flex-col">
                    <span className="text-gray-500">Waiver Consent</span>
                    {viewingRunner.consentGiven ? (
                      <span className="inline-flex items-center gap-1 text-green-400 font-medium w-fit mt-1">
                        Agreed
                        {viewingRunner.consentGivenAt && (
                          <span className="text-gray-500 font-normal">
                            &middot; {new Date(viewingRunner.consentGivenAt).toLocaleString()}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-orange-400 font-medium w-fit mt-1">
                        Not on record
                      </span>
                    )}
                  </p>
                  <p className="flex flex-col">
                    <span className="text-gray-500">Signed By</span>
                    {/* The name typed under the tick. Registrations taken
                        before a signature was asked for say so plainly rather
                        than showing an empty line that reads like a bug. */}
                    <span className={`font-medium ${viewingRunner.consentSignature ? 'text-white' : 'text-gray-500 italic'}`}>
                      {viewingRunner.consentSignature || 'Not asked at the time'}
                    </span>
                  </p>
                </div>

                {/* The validator's notes. Internal - this block has no
                    equivalent anywhere the runner can see, and nothing here
                    emails them. */}
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <p className="text-gray-500 text-sm m-0">Remarks (internal)</p>
                    <button
                      onClick={() => openRemarksModal(viewingRunner.id)}
                      className="text-xs font-medium text-accent-blue hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      {viewingRunner.remarks ? 'Edit remarks' : 'Add remarks'}
                    </button>
                  </div>
                  {viewingRunner.remarks ? (
                    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                      <p className="text-sm text-white whitespace-pre-wrap m-0">{viewingRunner.remarks}</p>
                      {(viewingRunner.remarksBy || viewingRunner.remarksAt) && (
                        <p className="text-xs text-gray-500 mt-3 m-0">
                          {viewingRunner.remarksBy || 'Unknown'}
                          {viewingRunner.remarksAt && ` \u00b7 ${new Date(viewingRunner.remarksAt).toLocaleString()}`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic m-0">No remarks yet.</p>
                  )}
                </div>
                  
                {viewingRunner.isBankTransfer && (
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
                {viewingRunner.status === 'PENDING' && viewingRunner.isBankTransfer && (
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
                      onChange={e => setEditingRunner({...editingRunner, firstName: upperCaseAsTyped(e.target.value)})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Last Name</label>
                    <input 
                      type="text" 
                      required 
                      value={editingRunner.lastName || ''} 
                      onChange={e => setEditingRunner({...editingRunner, lastName: upperCaseAsTyped(e.target.value)})}
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
                    {/* Uppercased on read as well as on write: rows created
                        before gender was stored uppercase still hold "Male",
                        and a value matching no option would silently show the
                        wrong one. */}
                    <select
                      value={(editingRunner.gender || '').toUpperCase()}
                      onChange={e => setEditingRunner({...editingRunner, gender: e.target.value})}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30"
                    >
                      <option value="MALE">MALE</option>
                      <option value="FEMALE">FEMALE</option>
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
                    <label className="text-sm text-gray-400">Shirt Size</label>
                    <input
                      type="text"
                      list="shirt-size-options"
                      value={editingRunner.singletSize || ''}
                      onChange={e => setEditingRunner({...editingRunner, singletSize: e.target.value})}
                      placeholder="Blank if no shirt in this package"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white/30"
                    />
                    <datalist id="shirt-size-options">
                      {SHIRT_SIZES.map(size => <option key={size} value={size} />)}
                    </datalist>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-sm text-gray-400">Running Community</label>
                    <input
                      type="text"
                      value={editingRunner.runningCommunity || ''}
                      onChange={e => setEditingRunner({...editingRunner, runningCommunity: upperCaseAsTyped(e.target.value)})}
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
                        onChange={e => setEditingRunner({...editingRunner, emergencyContactName: upperCaseAsTyped(e.target.value)})}
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

      {/*
        Remarks Modal.

        Built from the same panel the edit and delete modals use rather than a
        browser prompt(): an OS dialog ignores the dark palette entirely and
        blocks the thread, which is exactly why AlertProvider replaced
        window.alert. It is not AlertModal itself because that dialog carries a
        message, not an input - a textarea inside its ReactNode message would be
        captured at enqueue time and go stale on the first keystroke.

        Internal by design. Saving a note sends nothing to the runner; an
        assigned staff member follows up by hand.
      */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isRemarksOpen && !isRemarksClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`t-modal w-full max-w-lg bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col ${isRemarksOpen ? 'is-open' : ''} ${isRemarksClosing ? 'is-closing' : ''}`}
        >
          <div className="p-6 border-b border-white/10 flex justify-between items-start gap-4">
            <div>
              <h3 className="text-xl font-semibold text-white m-0">Payment Remarks</h3>
              {remarkingRunner && (
                <p className="text-sm text-gray-400 mt-1 m-0">
                  Order {remarkingRunner.orderRef} &middot;{' '}
                  {runnersOnOrder(remarkingRunner) > 1
                    ? `${runnersOnOrder(remarkingRunner)} runners`
                    : remarkingRunner.name}
                </p>
              )}
            </div>
            <button onClick={closeRemarksModal} className="text-gray-400 hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-3">
            <label htmlFor="registration-remarks" className="block text-sm text-gray-400">
              What did you find when you checked this payment?
            </label>
            <textarea
              id="registration-remarks"
              value={remarksDraft}
              onChange={e => setRemarksDraft(e.target.value)}
              rows={5}
              placeholder="e.g. Deposit slip is for ₱1,200 but the order total is ₱1,500. Called the runner on 09/06."
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white/30 resize-y"
            />
            <p className="text-xs text-gray-500 m-0">
              Internal only. The runner is never shown this and no email is sent
              {remarkingRunner && runnersOnOrder(remarkingRunner) > 1
                ? '. It applies to every runner on this order.'
                : '.'}
            </p>
            {remarkingRunner?.remarksBy && remarkingRunner?.remarksAt && (
              <p className="text-xs text-gray-500 m-0">
                Last written by {remarkingRunner.remarksBy} on{' '}
                {new Date(remarkingRunner.remarksAt).toLocaleString()}.
              </p>
            )}
          </div>

          <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-black/20">
            <button
              type="button"
              onClick={closeRemarksModal}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors bg-transparent border-none cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemarksSave}
              disabled={isSavingRemarks || (!remarksDraft.trim() && !remarkingRunner?.remarks)}
              className="px-6 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isSavingRemarks
                ? 'Saving...'
                : !remarksDraft.trim() && remarkingRunner?.remarks
                  ? 'Clear Remarks'
                  : 'Save Remarks'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
