"use client";

/**
 * The registrants screen's client half: the runners it holds, the one TanStack
 * table instance the desktop table, the cards, the pager and the bulk bar all
 * read, and where each modal is mounted.
 *
 * It was the largest file in the repository, and the parts that grew it live
 * beside it now (UNPAID_ORDERS_PLAN.md Batch 2): the columns in
 * `registrant-columns.tsx`, a row's buttons in `RegistrantRowActions.tsx`, the
 * toolbar and its filters in `RegistrantsToolbar.tsx`, and the remarks, email
 * and delete modals each in their own file with their state. This file keeps
 * the runners, so every modal hands its result back here rather than editing
 * a copy of the list.
 */

import React, { useState, useMemo } from 'react';
import { Download, X, Trash2 } from 'lucide-react';
import ProofLightbox from './ProofLightbox';
import AdminCardList from '../../../AdminCardList';
import AdminTablePager from '../../../AdminTablePager';
import RegistrantsDataTable from './RegistrantsDataTable';
import {
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import RegistrantDetailModal from './RegistrantDetailModal';
import RunnerEditModal, { mergeSavedRunner } from './RunnerEditModal';
import { MinorBadge, RegistrantStatusBadges } from './registrant-display';
import { buildRegistrantCsv, downloadRegistrantCsv } from './registrant-csv';
import { buildRegistrantColumns } from './registrant-columns';
import RegistrantRowActions, { type RegistrantRowActionHandlers } from './RegistrantRowActions';
import RegistrantsToolbar, { useRegistrantQueues } from './RegistrantsToolbar';
import RemarksModal, { useRemarksModal } from './RemarksModal';
import ManualEmailModal, { useManualEmailModal } from './ManualEmailModal';
import {
  BulkDeleteModal,
  DeleteRegistrantModal,
  useBulkDeleteModal,
  useDeleteRegistrantModal,
} from './DeleteRegistrantModals';

/**
 * What the signed-in person may do on this event, decided by page.tsx with the
 * same `can()` the registrants routes enforce (STAFF_ACCESS_PLAN.md §3). Each
 * control below is offered only where its route would agree; the routes still
 * refuse on their own, so this is what a person sees, not what they can reach.
 */
export type RegistrantPermissions = {
  validate: boolean;
  remark: boolean;
  email: boolean;
  edit: boolean;
  remove: boolean;
  proof: boolean;
  /** The organizer's activity trail, for the order's "full activity" link. */
  activity: boolean;
};

interface RegistrantsTableProps {
  eventId: string;
  /**
   * The race day (`Event.date`, YYYY-MM-DD). A runner's age is counted on it,
   * so the edit modal can tell staff when a corrected birthdate makes someone
   * a minor (lib/minor-consent.ts).
   */
  raceDay: string;
  runners: any[];
  permissions: RegistrantPermissions;
  /**
   * What the search box starts with, from `?search=` on the URL.
   *
   * The marketing screen's redemptions panel links here with an order
   * reference in it, so an organizer looking at "this promotion gave ₱500 to
   * RM-D918005C" lands on that order rather than on a thousand runners to
   * scroll through. It is the box's starting value, not a lock — clearing it
   * shows everyone, and no filter is hidden from the person using it.
   */
  initialSearch?: string;
}

/** One row as page.tsx builds it; named so the files split from this one can say so. */
export type RegistrantRow = RegistrantsTableProps['runners'][number];

export default function RegistrantsTable({
  eventId,
  raceDay,
  runners: initialRunners,
  initialSearch = '',
  permissions,
}: RegistrantsTableProps) {
  const [runners, setRunners] = useState(initialRunners);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [viewingRunner, setViewingRunner] = useState<any | null>(null);

  // The proof of payment, full-screen. It is the runner whose receipt is
  // open rather than a boolean, because the lightbox prints the order's own
  // numbers under the image and can validate it from there — the detail
  // modal behind it stays exactly where it was.
  const [proofRunner, setProofRunner] = useState<any | null>(null);

  // Edit Modal State
  const [editingRunner, setEditingRunner] = useState<any | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isEditClosing, setIsEditClosing] = useState(false);

  const deleteModal = useDeleteRegistrantModal({
    runners,
    onDeleted: runnerId => setRunners(runners.filter(r => r.id !== runnerId)),
  });

  const remarks = useRemarksModal({
    runners,
    onSaved: (registrationId, registration) => {
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
    },
  });

  const email = useManualEmailModal({
    runners,
    onMarkedSent: (registrationId, registration, outstanding) => {
      // Every runner on the order carries the same mark, for the same reason
      // the remarks do — otherwise one member of a group would look handled
      // and the other four would not.
      setRunners(runners.map(r => r.registrationId === registrationId ? {
        ...r,
        emailPending: outstanding !== null,
        emailPendingKind: outstanding,
        emailPendingLabel: outstanding === 'CONFIRMATION' ? 'Payment Receipt' : outstanding === 'RECEIVED' ? 'Registration Received' : null,
        lastEmailError: registration?.lastEmailError ?? null,
        receivedEmailSentAt: registration?.receivedEmailSentAt ?? r.receivedEmailSentAt,
        confirmationEmailSentAt: registration?.confirmationEmailSentAt ?? r.confirmationEmailSentAt,
        manualEmailSentAt: registration?.manualEmailSentAt ?? null,
        manualEmailSentBy: registration?.manualEmailSentBy ?? null,
      } : r));
    },
  });

  const queues = useRegistrantQueues(runners);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState(initialSearch);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const handleStatusChange = async (registrationId: string, newStatus: string) => {
    setUpdatingId(registrationId);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const { statusChange } = await res.json().catch(() => ({ statusChange: null }));
        // The route answers with who made the change, so the detail modal's
        // "Validated by" line names them now rather than after a reload — and
        // the open modal and lightbox hold copies of the row, so they move too.
        const settle = (row: RegistrantRow | null) =>
          row && row.registrationId === registrationId
            ? { ...row, status: newStatus, statusRecord: statusChange ?? row.statusRecord }
            : row;
        setRunners(current => current.map(settle));
        setViewingRunner(settle);
        setProofRunner(settle);
      } else {
        console.error('Failed to update status');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  /**
   * Marks a bank transfer paid from either door — the detail modal's footer
   * or the receipt lightbox — and moves whichever panel is open with it, so
   * a validated order is never left sitting in front of somebody still
   * saying PENDING.
   */
  const validatePayment = (runner: any) => {
    handleStatusChange(runner.registrationId, 'PAID');
    const paid = (current: any) =>
      current && current.registrationId === runner.registrationId
        ? { ...current, status: 'PAID' }
        : current;
    setViewingRunner(paid);
    setProofRunner(paid);
  };

  /**
   * Open the detail modal from a runner's id rather than from the row object.
   *
   * The eye on the Reference cell already has the row in hand and can set it
   * directly; the actions menu only carries the id, like every other action on
   * it does, so it looks the runner up here. Reading from `runners` rather
   * than from a captured row also means the modal shows the list's current
   * state — remarks just saved, a payment just validated — not a stale copy.
   */
  const openViewModal = (runnerId: string) => {
    const runner = runners.find(r => r.id === runnerId);
    if (runner) {
      setViewingRunner(runner);
    }
  };

  const openEditModal = (runnerId: string) => {
    const runner = runners.find(r => r.id === runnerId);
    if (runner) {
      // The row carries the shirt size as `size`; the route takes it as
      // `singletSize`, so without this the field opened blank.
      setEditingRunner({ ...runner, singletSize: runner.size ?? '' });
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

  const rowActions: RegistrantRowActionHandlers = {
    permissions,
    updatingId,
    onStatusChange: handleStatusChange,
    onView: openViewModal,
    onEdit: openEditModal,
    onDelete: deleteModal.open,
    onRemarks: remarks.open,
    onEmail: email.open,
  };

  const columns = useMemo(
    () => buildRegistrantColumns({
      onView: setViewingRunner,
      renderActions: runner => <RegistrantRowActions runner={runner} layout="table" {...rowActions} />,
    }),
    // The row actions are rebuilt every render; updatingId and runners are
    // what they read that changes what a cell shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updatingId, runners]
  );

  const table = useReactTable({
    data: queues.visibleRunners,
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

  const bulkDelete = useBulkDeleteModal({
    table,
    runners,
    onDeleted: runnerIds => {
      setRunners(runners.filter(r => !runnerIds.includes(r.id)));
      setRowSelection({});
    },
  });

  const selectedCount = table.getSelectedRowModel().rows.length;

  // What the bulk bar last counted, so a bar on its way out still reads
  // "3 selected" while it fades rather than dropping to 0. Adjusted during
  // render, which is React's own pattern for state that follows a value.
  const [bulkBarCount, setBulkBarCount] = useState(0);
  if (selectedCount > 0 && selectedCount !== bulkBarCount) {
    setBulkBarCount(selectedCount);
  }

  /**
   * The export, as the table calls it: the columns and the Excel-proofing
   * live in registrant-csv.ts, and what leaves here is whichever rows are on
   * screen — the selection if there is one, every filtered row otherwise.
   */
  const handleExportCSV = () => {
    const selectedRows = table.getSelectedRowModel().rows;
    const rowsToExport = selectedRows.length > 0 ? selectedRows : table.getFilteredRowModel().rows;

    // The file is built in the browser from rows the screen already holds, so
    // the audit trail can only be told about it
    // (api/admin/events/[id]/registrants/export). Fire and forget, with
    // keepalive so the request outlives the download starting: a log that
    // failed must not cost the organizer their file.
    void fetch(`/api/admin/events/${eventId}/registrants/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: rowsToExport.length, selected: selectedRows.length > 0 }),
      keepalive: true,
    }).catch(() => {});

    downloadRegistrantCsv(buildRegistrantCsv(rowsToExport.map(r => r.original)), eventId);
  };

  return (
    <div className="flex flex-col gap-4 w-full text-primary">
      <RegistrantsToolbar
        table={table}
        runners={runners}
        queues={queues}
        globalFilter={globalFilter}
        setGlobalFilter={setGlobalFilter}
        canRemove={permissions.remove}
        selectedCount={selectedCount}
        onBulkDelete={bulkDelete.open}
        onExport={handleExportCSV}
      />

      {/* From `lg` up; the cards below take its place under it. */}
      <RegistrantsDataTable table={table} empty="No registrants found." />

      {/*
        The same rows as the table above, below `lg` (AdminCardList): search,
        the queue chips, filters, sort, selection and the page all come from
        the one table instance. A group's members keep their order (-1 above
        -2) because the rows arrive in registration order and nothing here
        re-sorts them.
      */}
      <div className="dash-mobile-only">
        <AdminCardList
          items={table.getRowModel().rows}
          getKey={row => row.id}
          label="Registrants"
          className="is-flush"
          selection={{
            isSelected: row => row.getIsSelected(),
            toggle: row => row.toggleSelected(),
            label: row => `Select ${row.original.name}`,
          }}
          selectAll={{
            checked: table.getIsAllPageRowsSelected(),
            toggle: () => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected()),
            label: `Select all ${table.getRowModel().rows.length} on this page`,
          }}
          // The registrant's own number from the server, never the position.
          leading={row => <span className="font-mono">{row.original.regNo}</span>}
          // A name is untrusted length: it truncates rather than holding the
          // card open, and so does the email under it, as in the table cell.
          title={row => (
            <>
              <span className="block truncate">{row.original.name}</span>
              <span className="block truncate text-xs font-normal text-secondary">{row.original.email}</span>
            </>
          )}
          // The reference alone. The table's eye beside it was left off the
          // card at the owner's request; View Details in the card's ⋯ menu
          // opens the same modal.
          subtitle={row => (
            <>
              <span className="block">{row.original.runnerRef}</span>
              <span className="block text-xs">{row.original.registeredAtLabel}</span>
            </>
          )}
          badges={row => (
            <>
              {row.original.isMinor && <MinorBadge />}
              <RegistrantStatusBadges runner={row.original} />
              {/* What the table's badges say only on hover, said in words:
                  a phone has no hover. Allowed to wrap, unlike the chips. */}
              {row.original.status === 'EXPIRED' && (
                <span className="status-note neutral" style={{ flexBasis: '100%', marginTop: 0, whiteSpace: 'normal' }}>
                  Never paid, so its slot and any promo code it used were released.
                </span>
              )}
              {row.original.emailPending && (
                <span className="status-note neutral" style={{ flexBasis: '100%', marginTop: 0, whiteSpace: 'normal' }}>
                  The {row.original.emailPendingLabel} email has not gone out.
                </span>
              )}
            </>
          )}
          fields={row => [
            { label: 'Category', value: row.original.category },
            { label: 'Size', value: row.original.size || '—' },
            { label: 'Province', value: row.original.addressProvince || '—' },
            { label: 'Logistics', value: row.original.logisticsMethod },
            { label: 'Payment', value: row.original.paymentMethod },
          ]}
          actions={row => <RegistrantRowActions runner={row.original} layout="card" {...rowActions} />}
          empty={
            <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
              No registrants found.
            </div>
          }
        />
      </div>

      <AdminTablePager table={table} />

      {/*
        The bulk bar, below `lg`, while rows are selected. From `lg` up the red
        chip in the toolbar does this. Export here is the toolbar's own export
        (selected rows, audit call first); Clear empties the selection. See
        `.bulk-bar` in Admin.css for why it is fixed rather than sticky.
      */}
      <div className="bulk-bar-spacer dash-mobile-only" hidden={selectedCount === 0} aria-hidden="true" />
      <div className="dash-mobile-only">
        <div
          role="region"
          aria-label="Selected registrants"
          className={`bulk-bar t-toast ${selectedCount > 0 ? 'is-open' : ''}`}
        >
          <span className="bulk-bar-count" aria-live="polite">{bulkBarCount} selected</span>
          <button type="button" onClick={handleExportCSV} className="btn-filter bulk-bar-export">
            <Download size={16} aria-hidden="true" /> Export
          </button>
          {permissions.remove && (
            <button type="button" onClick={bulkDelete.open} className="btn-filter is-danger bulk-bar-delete">
              <Trash2 size={16} aria-hidden="true" /> Delete
            </button>
          )}
          <button type="button" onClick={() => setRowSelection({})} className="btn-filter bulk-bar-clear">
            <X size={16} aria-hidden="true" /> Clear
          </button>
        </div>
      </div>

      {viewingRunner && (
        <RegistrantDetailModal
          runner={viewingRunner}
          orderRunners={runners.filter(r => r.registrationId === viewingRunner.registrationId)}
          eventId={eventId}
          permissions={permissions}
          updatingId={updatingId}
          onClose={() => setViewingRunner(null)}
          onValidate={validatePayment}
          onOpenProof={setProofRunner}
          onOpenRemarks={remarks.open}
          onOpenEmail={email.open}
        />
      )}

      {/* The receipt, full screen. Sits above the detail modal rather than
          replacing it: the organizer came from that panel and goes straight
          back to it. */}
      {proofRunner && (
        <ProofLightbox
          registrationId={proofRunner.registrationId}
          orderRef={proofRunner.orderRef}
          transactionNumber={proofRunner.transactionNumber}
          totalAmount={proofRunner.totalAmount}
          status={proofRunner.status}
          isPdf={proofRunner.proofIsPdf}
          canValidate={permissions.validate && proofRunner.status === 'PENDING' && proofRunner.isBankTransfer}
          isValidating={updatingId === proofRunner.registrationId}
          onValidate={() => validatePayment(proofRunner)}
          onClose={() => setProofRunner(null)}
        />
      )}

      <RunnerEditModal
        runner={editingRunner}
        setRunner={setEditingRunner}
        isOpen={isEditOpen}
        isClosing={isEditClosing}
        raceDay={raceDay}
        onClose={closeEditModal}
        onSaved={saved =>
          setRunners(current =>
            current.map(r => (r.id === saved.id ? mergeSavedRunner(r, saved, raceDay) : r)),
          )
        }
      />

      <DeleteRegistrantModal {...deleteModal.modalProps} />
      <BulkDeleteModal {...bulkDelete.modalProps} />
      <RemarksModal {...remarks.modalProps} />
      <ManualEmailModal {...email.modalProps} />
    </div>
  );
}
