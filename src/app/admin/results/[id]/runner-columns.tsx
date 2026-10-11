"use client";

import React from 'react';
import { Check } from 'lucide-react';
import type { ColumnDef, FilterFn } from '@tanstack/react-table';
import { toWholeSeconds } from '@/lib/race-time';
import { rowPosition } from '../../events/EventRowCells';
import { rankLabel, rankSortValue, type RunnerRow } from './runner-row';
import RunnerBadges from './RunnerBadges';

/**
 * The race results table's columns (lg and up) and its search. The phone cards
 * (`RunnerCards`) read the same rows.
 */

export const runnerSearchFilter: FilterFn<RunnerRow> = (row, columnId, filterValue) => {
  const searchableRowContent = `${row.original.name} ${row.original.bibNumber}`.toLowerCase();
  const searchTerm = (filterValue ?? "").toLowerCase();
  return searchableRowContent.includes(searchTerm);
};

function SelectBox({ checked, onChange }: { checked: boolean; onChange: (event: unknown) => void }) {
  return (
    <div className="flex items-center justify-center px-1 w-8">
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="appearance-none w-4 h-4 rounded border border-[var(--ink-20)] bg-transparent checked:bg-[var(--ink)] checked:border-[var(--ink)] cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ink-20)]"
        />
        {checked && <Check className="absolute text-[var(--dash-inverse-fg)] pointer-events-none" size={12} strokeWidth={3} />}
      </div>
    </div>
  );
}

/** Keeps a row whose value is one of the chips picked under Filters. */
const inSelected: FilterFn<RunnerRow> = (row, columnId, filterValue) => {
  if (!filterValue || filterValue.length === 0) return true;
  return filterValue.includes(row.getValue(columnId));
};

/**
 * `renderActions` adds the row menu's column, last; the table passes it only
 * to someone who may manage the race's results.
 */
export function runnerColumns(renderActions?: (row: RunnerRow) => React.ReactNode): ColumnDef<RunnerRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <SelectBox checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />
      ),
      cell: ({ row }) => (
        <SelectBox checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "index",
      header: "No.",
      cell: ({ row, table }) => (
        <span className="text-secondary font-mono">{rowPosition(table.getSortedRowModel().flatRows, row)}</span>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-primary">{row.original.name}</span>
          <RunnerBadges row={row.original} />
        </span>
      ),
    },
    {
      accessorKey: "bibNumber",
      header: "Bib Number",
      cell: ({ row }) => <span className="text-secondary">{row.original.bibNumber}</span>,
    },
    {
      id: "category",
      accessorFn: (row) => row.category.name,
      header: "Category",
      cell: ({ row }) => <span className="text-secondary">{row.original.category.name}</span>,
      filterFn: inSelected,
    },
    {
      accessorKey: "gender",
      header: "Gender",
      cell: ({ row }) => <span className="text-secondary">{row.original.gender}</span>,
      filterFn: inSelected,
    },
    {
      // A pacer or a non-finisher has no rank; sorted as the largest, so they
      // sit after every ranked finisher rather than wherever a null lands.
      id: "categoryRank",
      accessorFn: (row) => rankSortValue(row.categoryRank),
      header: "Category Rank",
      cell: ({ row }) => <span className="text-secondary">{rankLabel(row.original.categoryRank)}</span>,
    },
    {
      id: "genderRank",
      accessorFn: (row) => rankSortValue(row.genderRank),
      header: "Gender Rank",
      cell: ({ row }) => <span className="text-secondary">{rankLabel(row.original.genderRank)}</span>,
    },
    {
      accessorKey: "chipTime",
      header: "Chip Time",
      cell: ({ row }) => <span className="text-secondary">{toWholeSeconds(row.original.chipTime)}</span>,
    },
    {
      accessorKey: "gunTime",
      header: "Gun Time",
      cell: ({ row }) => <span className="text-secondary">{row.original.gunTime ? toWholeSeconds(row.original.gunTime) : '-'}</span>,
    },
    ...(renderActions
      ? [{
          // Left-aligned, under its own header label (§8 rule 6).
          id: 'actions',
          header: 'Actions',
          cell: ({ row }) => renderActions(row.original),
          enableSorting: false,
          enableHiding: false,
        } satisfies ColumnDef<RunnerRow>]
      : []),
  ];
}
