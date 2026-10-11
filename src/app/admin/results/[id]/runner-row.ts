/**
 * One finisher on a race's results table in the Results workspace, as
 * /admin/results/[id] hands it over (its ranks already without pacers).
 */
export interface RunnerRow {
  id: string;
  overallRank: number;
  /** Without pacers (`ranksWithoutPacers`); null for a pacer, shown as "-". */
  categoryRank: number | null;
  genderRank: number | null;
  bibNumber: string;
  name: string;
  gender: string;
  /** As the timer's sheet wrote it ("M"), for *Edit details*; `gender` is the division in words. */
  storedGender: string;
  categoryId: string;
  category: { name: string };
  chipTime: string;
  gunTime: string | null;
  /** FINISHED, DNF, DNS or DQ (`result-status.ts`); only FINISHED holds a place. */
  status: string;
  /**
   * Made by hand since the last upload, which a new upload replaces: ADDED
   * with *Add runner*, EDITED with *Edit details* (`handMade`). Null for a
   * row as the sheet gave it.
   */
  byHand: HandMade;
  /** One of the race's pacers (`pacerResultMatcher`): kept off the public podium. */
  isPacer?: boolean;
  /** The group a pacer leads ("SUB1"), or null. */
  paceGroup?: string | null;
  /**
   * Where a pacer came from (RESULTS_ROW_ACTIONS_PLAN.md O5): a pacer code
   * under Events, or a tag from this table. Null for a runner.
   */
  pacerSource?: 'EVENTS' | 'RESULTS' | null;
  /** The tag's id when `pacerSource` is RESULTS, for its row actions. */
  pacerTagId?: string | null;
}

export type HandMade = 'ADDED' | 'EDITED' | null;

/**
 * Which hand touched a row, from its two stamps. *Add runner* writes
 * `createdAt` and `editedAt` from one clock reading, so equal stamps mean the
 * row was added here and never changed since; any later *Edit details* moves
 * `editedAt` on and it reads EDITED. No column of its own: both mean the same
 * to the upload (replaced by a new sheet), only the badge's word differs.
 */
export function handMade(createdAt: Date, editedAt: Date | null): HandMade {
  if (!editedAt) return null;
  return editedAt.getTime() === createdAt.getTime() ? 'ADDED' : 'EDITED';
}

/**
 * What a pacer's badge says. A code pacer's says where to change them, since
 * this table offers nothing on their row (O5); a tag made here is plain.
 */
export function pacerBadgeLabel(row: Pick<RunnerRow, 'pacerSource'>): string {
  return row.pacerSource === 'EVENTS' ? 'Pacer · from Events' : 'Pacer';
}

/**
 * A rank as printed: "#3", or "-" for a pacer or a runner who did not finish
 * (rank 0), neither of whom holds a place.
 */
export function rankLabel(rank: number | null): string {
  return rank == null || rank <= 0 ? '-' : `#${rank}`;
}

/** A rank as sorted: no place sorts after every ranked finisher. */
export function rankSortValue(rank: number | null): number {
  return rank == null || rank <= 0 ? Number.MAX_SAFE_INTEGER : rank;
}
