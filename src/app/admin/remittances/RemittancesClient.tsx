"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Search, X } from 'lucide-react';
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import AdminCardList from '@/app/admin/AdminCardList';
import AdminDataTable, { AdminColumnsMenu, rowPosition } from '@/app/admin/AdminDataTable';
import AdminTablePager from '@/app/admin/AdminTablePager';
import FiltersMenu from '@/app/admin/FiltersMenu';
import MobileSortMenu from '@/app/admin/MobileSortMenu';
import { formatEventDayShort } from '@/lib/event-schedule';
import {
  SETTLEMENT_STATE_COPY,
  formatSignedPesos,
  type SettlementState,
} from '@/lib/settlement';
import type { EventSettlementRow } from '@/lib/settlement-store';
import SettlementBadge from './SettlementBadge';

/**
 * The races and where each stands with its organizer — the searchable half of
 * `/admin/remittances`. The figures arrive from the server page.
 *
 * The events table's furniture (`AdminDataTable`, §9): sortable headers, the
 * View chip, the pager, and cards below `lg` reading the same table instance.
 *
 * **The chips find, they never sort**, as on every list in the dashboard: the
 * races stay latest first until somebody clicks a header, and Balance Due is
 * how staff find the ones still waiting. The due count rides on its chip
 * because it is the number a person opening this screen came for.
 *
 * A row opens the race's settlement. On the table the whole row does, and
 * every row and card also carries a labelled **View Details** — the eye the
 * registrants screen uses for the same job — because a bare chevron did not
 * tell staff what it was for.
 */

const FILTERS: SettlementState[] = ['DUE', 'OVERPAID', 'SETTLED', 'NOTHING'];

const hrefOf = (row: EventSettlementRow) => `/admin/remittances/${row.id}`;
const clientLine = (row: EventSettlementRow) => row.clientName ?? 'No client linked';

const COLUMNS: ColumnDef<EventSettlementRow>[] = [
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
    id: 'title',
    header: 'Event',
    accessorFn: row => row.title,
    cell: ({ row }) => (
      <div className="min-w-48">
        <div className="font-medium text-primary">{row.original.title}</div>
        <div className="text-xs text-secondary">
          {formatEventDayShort(row.original.date)} · {clientLine(row.original)}
        </div>
      </div>
    ),
    enableHiding: false,
  },
  {
    // Run As One's share rides under what was collected rather than taking a
    // column: the two are one fact (what came in, and the part of it that
    // stays), and a column more overflowed the table at a laptop's width.
    id: 'collected',
    header: 'Collected',
    accessorFn: row => row.settlement.collected,
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <div>{formatSignedPesos(row.original.settlement.collected)}</div>
        <div className="text-xs text-secondary">{formatSignedPesos(row.original.settlement.share)} Run As One</div>
      </div>
    ),
  },
  {
    id: 'owed',
    header: 'Owed',
    accessorFn: row => row.settlement.owed,
    cell: ({ row }) => <span className="whitespace-nowrap">{formatSignedPesos(row.original.settlement.owed)}</span>,
  },
  {
    id: 'remitted',
    header: 'Remitted',
    accessorFn: row => row.settlement.remitted,
    cell: ({ row }) => <span className="whitespace-nowrap">{formatSignedPesos(row.original.settlement.remitted)}</span>,
  },
  {
    id: 'balance',
    header: 'Balance',
    accessorFn: row => row.settlement.balance,
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-semibold text-primary">
        {formatSignedPesos(row.original.settlement.balance)}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: row => SETTLEMENT_STATE_COPY[row.settlement.state].label,
    cell: ({ row }) => <SettlementBadge state={row.original.settlement.state} />,
  },
  {
    // Under its own header label; a real link, so it can be opened in a new tab
    // and reached by keyboard. The wrapper swallows the click, so the row's own
    // navigation does not fire as well.
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <div className="flex" onClick={e => e.stopPropagation()}>
        <Link
          href={hrefOf(row.original)}
          className="btn-filter whitespace-nowrap"
          aria-label={`View details for ${row.original.title}`}
        >
          <Eye size={16} aria-hidden="true" /> View Details
        </Link>
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];

export default function RemittancesClient({ rows }: { rows: EventSettlementRow[] }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  // The Filters sheet's settlement states; none chosen is every race.
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const term = searchTerm.trim().toLowerCase();
  // Memoized: the table goes back to page one whenever its data changes identity.
  const filtered = useMemo(
    () =>
      rows.filter(
        row =>
          (selectedStates.length === 0 || selectedStates.includes(row.settlement.state)) &&
          (!term ||
            row.title.toLowerCase().includes(term) ||
            (row.clientName ?? '').toLowerCase().includes(term)),
      ),
    [rows, selectedStates, term],
  );
  const countOf = (state: SettlementState) => rows.filter(row => row.settlement.state === state).length;

  const emptyMessage =
    rows.length === 0
      ? 'No events yet. A race appears here once it is created.'
      : term
        ? 'No events match this search and filter.'
        : `No events are ${selectedStates
            .map(state => SETTLEMENT_STATE_COPY[state as SettlementState].label.toLowerCase())
            .join(' or ')}.`;

  const table = useReactTable({
    data: filtered,
    columns: COLUMNS,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="flex flex-col gap-4 w-full text-primary">
      <div className="admin-toolbar" style={{ padding: '0 0 16px 0', borderBottom: 'none' }}>
        <div className="toolbar-actions" style={{ flex: 1 }}>
          <div className="search-wrapper">
            <Search className="search-icon" size={16} />
            <input
              type="text"
              placeholder="Search by event or client..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--ink-85)] bg-transparent border-none cursor-pointer"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <FiltersMenu
            groups={[{
              label: 'Settlement',
              options: FILTERS.map(state => {
                const { label } = SETTLEMENT_STATE_COPY[state];
                const count = state === 'DUE' ? countOf(state) : 0;
                return { value: state, label: count ? `${label} (${count})` : label };
              }),
              selected: selectedStates,
              onToggle: state => setSelectedStates(prev =>
                prev.includes(state) ? prev.filter(s => s !== state) : [...prev, state]),
            }]}
            onClear={() => setSelectedStates([])}
          />
          <AdminColumnsMenu table={table} />
          <MobileSortMenu table={table} />
        </div>
      </div>

      <AdminDataTable
        table={table}
        empty={emptyMessage}
        leadColumn="index"
        rowProps={row => ({
          onClick: () => router.push(hrefOf(row.original)),
          className: 'cursor-pointer',
        })}
      />

      {/* The same rows as the table above — search, sort and the page all come
          from the one table instance (AdminCardList). */}
      <div className="dash-mobile-only">
        <AdminCardList
          items={table.getRowModel().rows}
          getKey={row => row.id}
          label="Remittances by event"
          className="is-flush"
          title={({ original }) => original.title}
          subtitle={({ original }) => `${formatEventDayShort(original.date)} · ${clientLine(original)}`}
          badges={({ original }) => <SettlementBadge state={original.settlement.state} />}
          fields={({ original }) => [
            { label: 'Balance', value: <strong className="text-primary">{formatSignedPesos(original.settlement.balance)}</strong> },
            { label: 'Collected', value: formatSignedPesos(original.settlement.collected) },
            { label: 'Owed', value: formatSignedPesos(original.settlement.owed) },
            { label: 'Remitted', value: formatSignedPesos(original.settlement.remitted) },
          ]}
          actions={({ original }) => (
            <Link href={hrefOf(original)} className="btn-filter" aria-label={`View details for ${original.title}`}>
              <Eye size={16} aria-hidden="true" /> View Details
            </Link>
          )}
          empty={
            <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">{emptyMessage}</div>
          }
        />
      </div>

      <AdminTablePager table={table} />
    </div>
  );
}
