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

/**
 * The orders a removal would leave with no runner, split the way the delete
 * routes treat them (`cancelEmptiedOrders`, UNPAID_ORDERS_PLAN.md Batch 5): a
 * PENDING order is cancelled with its last runner, a PAID one is left for a
 * person to settle. `runners` is every live runner on the screen, so an order's
 * runners are all here — the registrants list never shows part of an order.
 */
function ordersEmptiedBy(runners: RegistrantRow[], removedIds: string[]) {
  const removed = new Set(removedIds);
  const left = new Map<string, { orderRef: string; status: string; live: number }>();
  for (const r of runners) {
    const order = left.get(r.registrationId) ?? { orderRef: r.orderRef, status: r.status, live: 0 };
    if (!removed.has(r.id)) order.live++;
    left.set(r.registrationId, order);
  }
  const touched = new Set(runners.filter(r => removed.has(r.id)).map(r => r.registrationId));
  const emptied = [...touched].map(id => left.get(id)!).filter(order => order.live === 0);
  return {
    pending: emptied.filter(order => order.status === 'PENDING').map(order => order.orderRef),
    paid: emptied.filter(order => order.status === 'PAID').map(order => order.orderRef),
  };
}

/** What the confirmation says about the orders a removal empties. */
function EmptiedOrdersNote({ pending, paid, single }: ReturnType<typeof ordersEmptiedBy> & { single: boolean }) {
  if (pending.length === 0 && paid.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-relaxed text-primary [overflow-wrap:anywhere]">
      {pending.length > 0 && (
        <p>
          {single
            ? 'This is the last runner on this order. The order will be cancelled too.'
            : `This removes the last runner on ${pending.join(', ')}. ${pending.length === 1 ? 'That order' : 'Those orders'} will be cancelled too.`}
        </p>
      )}
      {paid.length > 0 && (
        <p>
          {single
            ? `This is the last runner on ${paid[0]}, which is paid. The order stays PAID — settle any refund separately.`
            : `${paid.join(', ')} ${paid.length === 1 ? 'is a paid order' : 'are paid orders'} left with no runner. ${paid.length === 1 ? 'It stays' : 'They stay'} PAID — settle any refund separately.`}
        </p>
      )}
    </div>
  );
}

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
      emptied: deletingRunner ? ordersEmptiedBy(runners, [deletingRunner.id]) : { pending: [], paid: [] },
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
  emptied,
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
          <EmptiedOrdersNote {...emptied} single />
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
  runners,
  onDeleted,
}: {
  table: Table<RegistrantRow>;
  runners: RegistrantRow[];
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
      emptied: isBulkDeleteOpen
        ? ordersEmptiedBy(runners, table.getSelectedRowModel().rows.map(row => row.original.id))
        : { pending: [], paid: [] },
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
  emptied,
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
          <EmptiedOrdersNote {...emptied} single={false} />
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
