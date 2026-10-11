import React from 'react';
import { resultStatusBadge } from '@/lib/result-status';
import { pacerBadgeLabel, type RunnerRow } from './runner-row';

type BadgeRow = Pick<RunnerRow, 'isPacer' | 'pacerSource' | 'status' | 'byHand'>;

/** Whether a runner wears any badge beyond their bib. */
export function hasRunnerBadges(row: BadgeRow): boolean {
  return Boolean(row.isPacer) || row.status !== 'FINISHED' || row.byHand != null;
}

/**
 * What a runner's row and card say beside the name: Pacer (and where from,
 * O5), a status other than Finished ("DQ", a fact rather than something to
 * act on, so neutral), and a quiet *Added* or *Edited* for a row made by
 * hand, which the next upload replaces (RESULTS_ROW_ACTIONS_PLAN.md Batches
 * 3 and 4).
 */
export default function RunnerBadges({ row }: { row: BadgeRow }) {
  return (
    <>
      {row.isPacer && <span className="status-badge info">{pacerBadgeLabel(row)}</span>}
      {row.status !== 'FINISHED' && (
        <span className="status-badge neutral">{resultStatusBadge(row.status)}</span>
      )}
      {row.byHand === 'ADDED' && (
        <span className="status-badge neutral" title="Added by hand. A new upload replaces it.">
          Added
        </span>
      )}
      {row.byHand === 'EDITED' && (
        <span className="status-badge neutral" title="Corrected by hand. A new upload replaces it.">
          Edited
        </span>
      )}
    </>
  );
}
