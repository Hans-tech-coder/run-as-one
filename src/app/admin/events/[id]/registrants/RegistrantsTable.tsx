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
import ProofLightbox from './ProofLightbox';
import AdminTablePager, { useFirstPageOnNewRows } from '../../../AdminTablePager';
import RegistrantsDataTable from './RegistrantsDataTable';
import RegistrantCards from './RegistrantCards';
import RegistrantsBulkBar from './RegistrantsBulkBar';
import { usePaymentStatus } from './usePaymentStatus';
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
import {
  MinorBadge,
  RegistrantStatusBadges,
  canValidatePayment,
  expiredExplanation,
} from './registrant-display';
import { buildRegistrantCsv, downloadRegistrantCsv } from './registrant-csv';
import { buildRegistrantColumns } from './registrant-columns';
import RegistrantRowActions, { type RegistrantRowActionHandlers } from './RegistrantRowActions';
import RegistrantsToolbar, { useRegistrantQueues } from './RegistrantsToolbar';
import RemarksModal, { useRemarksModal } from './RemarksModal';
import ManualEmailModal, { useManualEmailModal } from './ManualEmailModal';
import CategoryChangeModal from './CategoryChangeModal';
import { useCategoryChangeModal } from './useCategoryChangeModal';
import CategoryChangeEmailModal from './CategoryChangeEmailModal';
import { useOrderSwitch } from './useOrderSwitch';
import { useCategoryChanges } from './useCategoryChanges';
import { useRegistrantHistory } from './useRegistrantHistory';
import type { EventReceipts } from '@/lib/logistics-receipts';
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
   * The event's receipts as the pickup / delivery switch reads them
   * (`readEventReceipts`, LOGISTICS_CHANGE_PLAN.md Revision 2): what each
   * row's receipt may switch to, and everything the panels quote from.
   */
  switching: EventReceipts;
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
  switching,
}: RegistrantsTableProps) {
  const [runners, setRunners] = useState(initialRunners);
  // A delivery switch re-reads the page (router.refresh), and the rows it
  // moved come back as new props: take them, as React's "adjusting state when
  // a prop changes" does. Every other edit here is already saved, so the
  // fresh read never loses one.
  const [readRunners, setReadRunners] = useState(initialRunners);
  if (initialRunners !== readRunners) {
    setReadRunners(initialRunners);
    setRunners(initialRunners);
  }
  const [viewingRunner, setViewingRunner] = useState<any | null>(null);

  // The proof of payment, full-screen. It is the runner whose receipt is
  // open rather than a boolean, because the lightbox prints the order's own
  // numbers under the image and can validate it from there — the detail
  // modal behind it stays exactly where it was.
  const [proofRunner, setProofRunner] = useState<any | null>(null);

  // Validate Payment from the menu, the detail modal or the lightbox.
  const { updatingId, handleStatusChange, validatePayment } = usePaymentStatus({
    setRunners,
    setViewingRunner,
    setProofRunner,
  });

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

  // Change category, its history's writes and the applied email's by-hand
  // send (CATEGORY_CHANGE_PLAN.md), all handed back onto the rows here.
  const categoryChange = useCategoryChangeModal({ runners, setRunners, setViewingRunner });

  // Switch a receipt between kit pickup and delivery (LOGISTICS_CHANGE_PLAN.md
  // Revision 2): from any runner's row, for the whole order.
  const orderSwitch = useOrderSwitch({ switching, permissions });

  // A runner's category changes in their own modal (2026-10-21), from the
  // row menu: *Category Payment* while an upgrade waits, *Category Changes*.
  const categoryChanges = useCategoryChanges({
    runners,
    permissions,
    onUpdated: (runnerId, change, applied) =>
      applied ? categoryChange.onApplied(runnerId, applied) : categoryChange.updateChange(runnerId, change),
    onSendEmail: categoryChange.openChangeEmail,
  });

  // The row's one History (2026-10-21): category changes and the receipt's
  // pickup / delivery switches together.
  const history = useRegistrantHistory({
    runners,
    permissions,
    receiptFor: orderSwitch.receiptFor,
    onChangeUpdated: (runnerId, change, applied) =>
      applied ? categoryChange.onApplied(runnerId, applied) : categoryChange.updateChange(runnerId, change),
    onSendChangeEmail: categoryChange.openChangeEmail,
    onSendSwitchEmail: orderSwitch.sendEmail,
  });

  const queues = useRegistrantQueues(runners);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState(initialSearch);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

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
    onChangeCategory: categoryChange.open,
    categoryChangesFor: categoryChanges.menuFor,
    onCategoryChanges: categoryChanges.show,
    hasHistory: history.hasHistory,
    onHistory: history.show,
    orderSwitchFor: orderSwitch.menuFor,
    onSwitchLogistics: orderSwitch.startSwitch,
    onLogisticsDetails: orderSwitch.showDetails,
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
    // Page 1 on new rows comes from useFirstPageOnNewRows below; TanStack's
    // own reset warns on this screen (see the hook).
    autoResetPageIndex: false,
  });
  useFirstPageOnNewRows(table);

  const bulkDelete = useBulkDeleteModal({
    table,
    runners,
    onDeleted: runnerIds => {
      setRunners(runners.filter(r => !runnerIds.includes(r.id)));
      setRowSelection({});
    },
  });

  const selectedCount = table.getSelectedRowModel().rows.length;

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

      {/* The same rows as cards, below `lg` (RegistrantCards). */}
      <RegistrantCards table={table} rowActions={rowActions} />

      <AdminTablePager table={table} />

      <RegistrantsBulkBar
        selectedCount={selectedCount}
        canRemove={permissions.remove}
        onExport={handleExportCSV}
        onDelete={bulkDelete.open}
        onClear={() => setRowSelection({})}
      />

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
          canValidate={permissions.validate && canValidatePayment(proofRunner)}
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
      <CategoryChangeModal {...categoryChange.modalProps} />
      {/* Before the switch's element, so a switch email opened from History sits above it. */}
      {history.element}
      {orderSwitch.element}
      {categoryChanges.element}
      {categoryChange.changeEmail && (
        <CategoryChangeEmailModal
          key={categoryChange.changeEmail.changeId}
          request={categoryChange.changeEmail}
          onClose={categoryChange.closeChangeEmail}
          onMarked={(runnerId, change) => categoryChange.updateChange(runnerId, change)}
        />
      )}
    </div>
  );
}
