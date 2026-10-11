"use client";

import React from 'react';
import type { Row } from '@tanstack/react-table';
import AdminCardList from '../../AdminCardList';
import { rowPosition } from '../../events/EventRowCells';
import { toWholeSeconds } from '@/lib/race-time';
import { rankLabel, type RunnerRow } from './runner-row';
import RunnerBadges, { hasRunnerBadges } from './RunnerBadges';

/**
 * The race results below `lg`: the same TanStack rows as the table
 * (AdminCardList). A finisher's name is untrusted length, so it truncates on
 * its line rather than holding the card open; the bib is a chip beside
 * nothing, and the times go through toWholeSeconds exactly as the cells do.
 */
export default function RunnerCards({
  rows,
  sortedRows,
  renderActions,
  selectAll,
}: {
  rows: Row<RunnerRow>[];
  sortedRows: Row<RunnerRow>[];
  /** The row menu, in the card's footer; absent for someone who cannot manage results. */
  renderActions?: (row: RunnerRow, className: string) => React.ReactNode;
  /** The page's select-all, above the cards, for *Delete Selected*. */
  selectAll?: React.ComponentProps<typeof AdminCardList<Row<RunnerRow>>>['selectAll'];
}) {
  return (
    <AdminCardList
      items={rows}
      getKey={row => row.id}
      label="Race results"
      className="is-flush"
      selection={{
        isSelected: row => row.getIsSelected(),
        toggle: row => row.toggleSelected(),
        label: row => `Select ${row.original.name}`,
      }}
      selectAll={selectAll}
      leading={row => <span className="font-mono">{rowPosition(sortedRows, row)}</span>}
      title={row => <span className="block truncate">{row.original.name}</span>}
      badges={row =>
        row.original.bibNumber || hasRunnerBadges(row.original) ? (
          <>
            {row.original.bibNumber && (
              <span className="status-badge neutral">Bib {row.original.bibNumber}</span>
            )}
            <RunnerBadges row={row.original} />
          </>
        ) : null
      }
      fields={row => [
        { label: 'Category', value: row.original.category.name },
        { label: 'Gender', value: row.original.gender || '-' },
        { label: 'Category Rank', value: rankLabel(row.original.categoryRank) },
        { label: 'Gender Rank', value: rankLabel(row.original.genderRank) },
        { label: 'Chip Time', value: <span className="tabular-nums">{toWholeSeconds(row.original.chipTime)}</span> },
        {
          label: 'Gun Time',
          value: row.original.gunTime
            ? <span className="tabular-nums">{toWholeSeconds(row.original.gunTime)}</span>
            : '-',
        },
      ]}
      actions={renderActions ? row => renderActions(row.original, 'ml-auto') : undefined}
      empty={
        <div className="border border-[var(--dash-border)] rounded-lg py-16 px-4 text-center text-[var(--text-muted)]">
          No results.
        </div>
      }
    />
  );
}
