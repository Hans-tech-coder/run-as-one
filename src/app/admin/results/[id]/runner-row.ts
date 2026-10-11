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
  category: { name: string };
  chipTime: string;
  gunTime: string | null;
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

/**
 * What a pacer's badge says. A code pacer's says where to change them, since
 * this table offers nothing on their row (O5); a tag made here is plain.
 */
export function pacerBadgeLabel(row: Pick<RunnerRow, 'pacerSource'>): string {
  return row.pacerSource === 'EVENTS' ? 'Pacer · from Events' : 'Pacer';
}

/** A rank as printed: "#3", or "-" for a pacer, who holds no place. */
export function rankLabel(rank: number | null): string {
  return rank == null ? '-' : `#${rank}`;
}
