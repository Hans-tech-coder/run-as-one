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
}

/** A rank as printed: "#3", or "-" for a pacer, who holds no place. */
export function rankLabel(rank: number | null): string {
  return rank == null ? '-' : `#${rank}`;
}
