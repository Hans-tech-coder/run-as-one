"use client";

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, FileText, Plus } from 'lucide-react';
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useAlert } from '@/components/ui/AlertProvider';
import AdminCardList from '@/app/admin/AdminCardList';
import AdminDataTable, { AdminColumnsMenu, rowPosition } from '@/app/admin/AdminDataTable';
import AdminTablePager from '@/app/admin/AdminTablePager';
import MobileSortMenu from '@/app/admin/MobileSortMenu';
import RowActionsMenu from '@/app/admin/RowActionsMenu';
import { formatEventDayShort } from '@/lib/event-schedule';
import {
  describeRemittance,
  remittanceKindLabel,
  remittanceMethodLabel,
  formatSignedPesos,
} from '@/lib/settlement';
import type { RemittanceRow } from '@/lib/settlement-store';
import RecordRemittanceDialog from './RecordRemittanceDialog';
import VoidRemittanceDialog from './VoidRemittanceDialog';

/**
 * A race's remittances, and the two things that can be done about them:
 * record one, or void one (ADMIN_MERGE_PLAN.md, Batch 6).
 *
 * **Nothing here edits a remittance.** A wrong entry is voided with a reason
 * and the right one recorded, so the list keeps every line anyone wrote,
 * voided ones struck through with who voided them and why.
 *
 * After either write the page is refreshed (`router.refresh()`), so the
 * balance and the breakdown above are summed again by the server rather than
 * adjusted here — the screen never shows a figure the database would not.
 *
 * The list wears the events table's furniture (`AdminDataTable`, §9), under a
 * heading row holding Record Remittance where a toolbar would stand.
 *
 * The receipt opens through `api/admin/remittances/[id]/proof` in a new tab,
 * as a runner's proof does, which records the opening.
 */

/** When a line was written, as Manila reads it. Explicit locale and zone, so server and browser agree. */
const recordedOn = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  );

const COLUMN_LABELS: Record<string, string> = { recordedBy: 'Recorded By' };

const EMPTY_MESSAGE = 'Nothing remitted yet. Record a payout once money has been sent to the organizer.';

export default function SettlementClient({
  eventId,
  eventTitle,
  balance,
  today,
  remittances,
}: {
  eventId: string;
  eventTitle: string;
  balance: number;
  /** Manila's today, from the server, so the dialog's date and its check agree. */
  today: string;
  remittances: RemittanceRow[];
}) {
  const router = useRouter();
  const { toast } = useAlert();
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<RemittanceRow | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const statusBadge = (row: RemittanceRow) =>
    row.status === 'VOIDED' ? (
      <span className="status-badge neutral">Voided</span>
    ) : (
      <span className="status-badge success">Recorded</span>
    );

  const voidLine = (row: RemittanceRow) =>
    row.status === 'VOIDED' ? (
      <span className="block text-xs text-secondary mt-1 [overflow-wrap:anywhere]">
        Voided by {row.voidedByName ?? 'someone'}
        {row.voidedAt ? ` on ${recordedOn(row.voidedAt)}` : ''}: {row.voidReason}
      </span>
    ) : null;

  const receiptHref = (row: RemittanceRow) => `/api/admin/remittances/${row.id}/proof`;

  /** A remittance's ⋮ menu, for the table's Actions cell and the card's footer. */
  const menu = (row: RemittanceRow, className = '') => (
    <RowActionsMenu
      label={describeRemittance(row)}
      className={className}
      actions={[
        ...(row.hasProof
          ? [{ key: 'receipt', label: 'Open Receipt', icon: <FileText size={16} />, href: receiptHref(row) }]
          : []),
        ...(row.status === 'RECORDED'
          ? [{ key: 'void', label: 'Void', icon: <Ban size={16} />, onSelect: () => setVoiding(row), danger: true }]
          : []),
      ]}
    />
  );

  const amountCell = (row: RemittanceRow) => (
    <span className={row.status === 'VOIDED' ? 'remittance-voided' : undefined}>
      {formatSignedPesos(row.kind === 'RETURN' ? -row.amount : row.amount)}
    </span>
  );

  const columns = useMemo<ColumnDef<RemittanceRow>[]>(() => [
    {
      id: 'index',
      header: 'No.',
      cell: ({ row, table }) => (
        <span className="text-secondary font-mono">{rowPosition(table.getSortedRowModel().flatRows, row)}</span>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'sent',
      header: 'Sent',
      accessorFn: row => row.paidOn,
      cell: ({ row }) => <span className="whitespace-nowrap">{formatEventDayShort(row.original.paidOn)}</span>,
    },
    {
      id: 'kind',
      header: 'Kind',
      accessorFn: row => remittanceKindLabel(row.kind),
    },
    {
      // Signed, so a return sorts below every payout.
      id: 'amount',
      header: 'Amount',
      accessorFn: row => (row.kind === 'RETURN' ? -row.amount : row.amount),
      cell: ({ row }) => <span className="whitespace-nowrap font-medium text-primary">{amountCell(row.original)}</span>,
    },
    {
      id: 'method',
      header: 'Method',
      accessorFn: row => remittanceMethodLabel(row.method),
      cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue<string>()}</span>,
    },
    {
      id: 'reference',
      header: 'Reference',
      accessorFn: row => row.reference ?? '',
      cell: ({ row }) => (
        <div className="text-secondary max-w-56">
          <span className="[overflow-wrap:anywhere]">{row.original.reference ?? '—'}</span>
          {row.original.note && (
            <span className="block text-xs mt-1 [overflow-wrap:anywhere]">{row.original.note}</span>
          )}
        </div>
      ),
    },
    {
      id: 'recordedBy',
      header: 'Recorded By',
      accessorFn: row => row.createdAt,
      cell: ({ row }) => (
        <div className="text-secondary">
          <div>{row.original.recordedByName}</div>
          <div className="text-xs">{recordedOn(row.original.createdAt)}</div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: row => row.status,
      cell: ({ row }) => (
        <div className="max-w-64">
          {statusBadge(row.original)}
          {voidLine(row.original)}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => menu(row.original),
      enableSorting: false,
      enableHiding: false,
    },
    // The helpers above only read the row and setVoiding, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const table = useReactTable({
    data: remittances,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <>
      <div className="flex flex-col gap-4 w-full text-primary">
        <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
          <div className="toolbar-actions items-center" style={{ flex: 1 }}>
            <h2 className="admin-panel-title mr-auto">Remittances</h2>
            <AdminColumnsMenu table={table} labels={COLUMN_LABELS} />
            <MobileSortMenu table={table} labels={COLUMN_LABELS} />
          </div>
          <div className="toolbar-actions">
            <button type="button" className="btn-light" onClick={() => setRecording(true)}>
              <Plus size={16} aria-hidden="true" /> Record Remittance
            </button>
          </div>
        </div>

        <AdminDataTable table={table} empty={EMPTY_MESSAGE} leadColumn="index" />

        <div className="dash-mobile-only">
          <AdminCardList
            items={table.getRowModel().rows}
            getKey={row => row.id}
            label={`Remittances for ${eventTitle}`}
            className="is-flush"
            title={({ original }) => amountCell(original)}
            subtitle={({ original }) => `${remittanceKindLabel(original.kind)} · ${formatEventDayShort(original.paidOn)}`}
            badges={({ original }) => statusBadge(original)}
            fields={({ original: row }) => [
              { label: 'Method', value: remittanceMethodLabel(row.method) },
              { label: 'Reference', value: row.reference ?? '—' },
              ...(row.note ? [{ label: 'Note', value: row.note, full: true }] : []),
              { label: 'Recorded By', value: `${row.recordedByName} · ${recordedOn(row.createdAt)}`, full: true },
              ...(row.status === 'VOIDED'
                ? [
                    {
                      label: 'Voided',
                      value: `${row.voidedByName ?? 'Someone'}${row.voidedAt ? ` · ${recordedOn(row.voidedAt)}` : ''}: ${row.voidReason ?? ''}`,
                      full: true,
                    },
                  ]
                : []),
            ]}
            // The receipt one tap away when there is one; Void stays behind ⋮,
            // since a destructive press is never the card's shortcut.
            actions={({ original: row }) =>
              row.hasProof || row.status === 'RECORDED' ? (
                <>
                  {row.hasProof && (
                    <a href={receiptHref(row)} target="_blank" rel="noopener noreferrer" className="btn-filter">
                      <FileText size={16} aria-hidden="true" /> Receipt
                    </a>
                  )}
                  {menu(row, 'ml-auto')}
                </>
              ) : null
            }
            empty={
              <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">{EMPTY_MESSAGE}</div>
            }
          />
        </div>

        <AdminTablePager table={table} />
      </div>

      {recording && (
        <RecordRemittanceDialog
          eventId={eventId}
          eventTitle={eventTitle}
          balance={balance}
          today={today}
          onClose={saved => {
            setRecording(false);
            if (saved) {
              toast({ variant: 'success', message: `Recorded the ${saved}.` });
              router.refresh();
            }
          }}
        />
      )}

      {voiding && (
        <VoidRemittanceDialog
          key={voiding.id}
          remittance={voiding}
          onDone={voided => {
            setVoiding(null);
            if (voided) {
              toast({ variant: 'success', message: `Voided the ${describeRemittance(voiding)}.` });
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}
