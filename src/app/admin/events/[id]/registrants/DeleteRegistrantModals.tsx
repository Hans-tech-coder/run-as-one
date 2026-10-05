"use client";

/**
 * The two delete confirmations on the registrants screen: one runner from its
 * row menu, and the selected runners from the toolbar or the bulk bar.
 *
 * Split out of `RegistrantsTable.tsx` (UNPAID_ORDERS_PLAN.md Batch 2) with
 * their state. Each hook makes the request and hands the removed ids back
 * through `onDeleted`, so the table stays the one owner of its runners and its
 * selection.
 */

import React, { useState } from 'react';
import type { Table } from '@tanstack/react-table';
import BusyLabel from '@/components/ui/BusyLabel';
import { useAlert } from '@/components/ui/AlertProvider';
import type { RegistrantRow } from './RegistrantsTable';

export function useDeleteRegistrantModal({
  runners,
  onDeleted,
}: {
  runners: RegistrantRow[];
  onDeleted: (runnerId: string) => void;
}) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const [deletingRunner, setDeletingRunner] = useState<any | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleteClosing, setIsDeleteClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
        onDeleted(deletingRunner.id);
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

  return {
    open: openDeleteModal,
    modalProps: {
      runner: deletingRunner,
      isOpen: isDeleteOpen,
      isClosing: isDeleteClosing,
      isDeleting,
      onClose: closeDeleteModal,
      onConfirm: handleDeleteConfirm,
    },
  };
}

export function DeleteRegistrantModal({
  runner: deletingRunner,
  isOpen: isDeleteOpen,
  isClosing: isDeleteClosing,
  isDeleting,
  onClose: closeDeleteModal,
  onConfirm: handleDeleteConfirm,
}: ReturnType<typeof useDeleteRegistrantModal>['modalProps']) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isDeleteOpen && !isDeleteClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-registrant-title"
        className={`t-modal admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-red-500/20 rounded-2xl shadow-2xl p-6 max-sm:p-4 flex flex-col gap-6 ${isDeleteOpen ? 'is-open' : ''} ${isDeleteClosing ? 'is-closing' : ''}`}
      >
        <div className="admin-modal-body flex flex-col gap-2">
          <h3 id="delete-registrant-title" className="text-xl font-semibold text-primary">Delete Registrant</h3>
          <p className="text-secondary text-sm leading-relaxed [overflow-wrap:anywhere]">
            Are you sure you want to delete {deletingRunner?.name}? This action cannot be undone and will permanently remove them from the database.
          </p>
        </div>

        <div className="admin-modal-footer flex justify-end gap-3 pt-2 border-t border-[var(--dash-hairline)]">
          <button
            type="button"
            onClick={closeDeleteModal}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {isDeleting ? <BusyLabel>Deleting</BusyLabel> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reads the selection off the table at confirm time, as the toolbar shows it. */
export function useBulkDeleteModal({
  table,
  onDeleted,
}: {
  table: Table<RegistrantRow>;
  onDeleted: (runnerIds: string[]) => void;
}) {
  // Shadows window.alert on purpose — see AlertProvider.
  const { alert } = useAlert();
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleteClosing, setIsBulkDeleteClosing] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

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
        onDeleted(runnerIds);
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

  return {
    open: () => setIsBulkDeleteOpen(true),
    modalProps: {
      count: table.getSelectedRowModel().rows.length,
      isOpen: isBulkDeleteOpen,
      isClosing: isBulkDeleteClosing,
      isDeleting: isBulkDeleting,
      onClose: closeBulkDeleteModal,
      onConfirm: handleBulkDeleteConfirm,
    },
  };
}

export function BulkDeleteModal({
  count,
  isOpen: isBulkDeleteOpen,
  isClosing: isBulkDeleteClosing,
  isDeleting: isBulkDeleting,
  onClose: closeBulkDeleteModal,
  onConfirm: handleBulkDeleteConfirm,
}: ReturnType<typeof useBulkDeleteModal>['modalProps']) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--dash-scrim)] backdrop-blur-sm transition-opacity duration-200 ${
        isBulkDeleteOpen && !isBulkDeleteClosing ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-registrants-title"
        className={`t-modal admin-modal-panel w-full max-w-md bg-[var(--dash-panel-solid)] border border-red-500/20 rounded-2xl shadow-2xl p-6 max-sm:p-4 flex flex-col gap-6 ${isBulkDeleteOpen ? 'is-open' : ''} ${isBulkDeleteClosing ? 'is-closing' : ''}`}
      >
        <div className="admin-modal-body flex flex-col gap-2">
          <h3 id="bulk-delete-registrants-title" className="text-xl font-semibold text-primary">Delete Selected Registrants</h3>
          <p className="text-secondary text-sm leading-relaxed">
            Are you sure you want to delete the {count} selected registrants? This action cannot be undone and will permanently remove them from the database.
          </p>
        </div>

        <div className="admin-modal-footer flex justify-end gap-3 pt-2 border-t border-[var(--dash-hairline)]">
          <button
            type="button"
            onClick={closeBulkDeleteModal}
            className="px-4 py-2 text-sm font-medium text-[var(--ink-85)] hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleBulkDeleteConfirm}
            disabled={isBulkDeleting}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {isBulkDeleting ? <BusyLabel>Deleting</BusyLabel> : 'Delete Selected'}
          </button>
        </div>
      </div>
    </div>
  );
}
