"use client";

import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { rowPosition } from '../events/EventRowCells';
import { RESULT_KINDS, resultKind, type ResultRow } from './result-row';

/**
 * The Results list's cells and columns (lg and up). The cells are exported
 * because the phone card draws the same ones, so the two cannot disagree.
 */

export function ResultKindBadge({ row }: { row: ResultRow }) {
  const kind = RESULT_KINDS[resultKind(row)];
  return <span className={`status-badge ${kind.tone} whitespace-nowrap`}>{kind.label}</span>;
}

/**
 * How many finished. A results-only race with nothing uploaded says so in
 * words: a "0" reads as a race nobody finished, not one still waiting on its
 * sheet.
 */
export function FinisherCount({ row }: { row: ResultRow }) {
  if (row.finishers === 0) {
    return <span className="text-[var(--text-muted)] whitespace-nowrap">No results yet</span>;
  }
  return <span className="tabular-nums">{row.finishers.toLocaleString('en-PH')}</span>;
}

export function ClientName({ row }: { row: ResultRow }) {
  return row.client
    ? <span>{row.client.name}</span>
    : <span className="text-[var(--text-muted)]">No client yet</span>;
}

export function resultColumns(renderActions: (row: ResultRow) => React.ReactNode): ColumnDef<ResultRow>[] {
  return [
    {
      id: 'index',
      header: 'No.',
      cell: ({ row, table }) => (
        <span className="text-secondary font-mono">{row.original.listNo ?? rowPosition(table.getSortedRowModel().flatRows, row)}</span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'title',
      header: 'Event Name',
      cell: ({ row }) => <span className="font-medium text-primary">{row.original.title}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.date}</span>,
    },
    {
      id: 'kind',
      header: 'Type',
      accessorFn: row => RESULT_KINDS[resultKind(row)].label,
      cell: ({ row }) => <ResultKindBadge row={row.original} />,
    },
    {
      accessorKey: 'finishers',
      header: 'Finishers',
      cell: ({ row }) => <FinisherCount row={row.original} />,
    },
    {
      accessorKey: 'certificate',
      header: 'Certificate',
      cell: ({ row }) => row.original.certificate,
    },
    {
      id: 'client',
      header: 'Client',
      accessorFn: row => row.client?.name ?? '',
      cell: ({ row }) => <ClientName row={row.original} />,
    },
    {
      // Searched by the toolbar, never shown: the table has room for what a
      // row is scanned for, and the location is not it.
      accessorKey: 'location',
      enableSorting: false,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => renderActions(row.original),
      enableSorting: false,
    },
  ];
}
