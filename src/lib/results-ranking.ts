/**
 * How a race's stored ranks are worked out: the overall rank across the whole
 * race, the category rank, and the gender rank within the category, each by
 * chip time, fastest first. Only a FINISHED row is ranked and only a FINISHED
 * row takes a place: a DNF, DNS or DQ row (`result-status.ts`) gets 0 and the
 * finishers behind it move up (owner, Q1 of RESULTS_ROW_ACTIONS_PLAN.md). The
 * time is ranked **as typed** ("1:18:56.9"), so the timer's tenths break a tie
 * the whole-second `chipTimeSecs` column would lose, and equal times keep the
 * order the rows came in. One function for the upload and *Edit details*,
 * which re-ranks the whole race, so the two can never rank differently.
 * Pacers are left out on read, not here (`pacer-results.ts`).
 */

/**
 * A chip time in seconds: "HH:MM:SS" or "MM:SS", tenths kept. A blank time
 * sorts last; a time in any other shape does too.
 */
export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 999999;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 999999; // Fallback for invalid format
}

/**
 * Whether a typed time is one `parseTimeToSeconds` reads as a real time:
 * "1:18:56", "1:18:56.9" or "45:12". For *Edit details*, which refuses a
 * time the ranking would quietly sort last.
 */
export function isRaceTime(timeStr: string): boolean {
  return /^(\d{1,3}:)?\d{1,2}:\d{1,2}(\.\d+)?$/.test(timeStr.trim());
}

/** What the ranking reads and writes on one result. */
export interface RankableResult {
  categoryId: string;
  gender: string;
  chipTime: string;
  status: string;
  overallRank: number;
  categoryRank: number;
  genderRank: number;
}

/** Numbers the finishers of `group`, in its order, from 1. */
function placeFinishers<T extends RankableResult>(
  group: T[],
  set: (row: T, rank: number) => void,
) {
  let place = 0;
  for (const r of group) {
    if (r.status === 'FINISHED') set(r, ++place);
  }
}

/**
 * Sets every row's three ranks, in place, and leaves `rows` sorted fastest
 * first. Returns the same array.
 */
export function rankResults<T extends RankableResult>(rows: T[]): T[] {
  const secs = new Map(rows.map(r => [r, parseTimeToSeconds(r.chipTime)]));
  const byTime = (a: T, b: T) => secs.get(a)! - secs.get(b)!;

  // A rank left from before is never kept: a row that stopped finishing, or
  // whose gender no longer names a division, reads 0.
  for (const r of rows) {
    r.overallRank = 0;
    r.categoryRank = 0;
    r.genderRank = 0;
  }

  // Overall rank, across the entire race
  rows.sort(byTime);
  placeFinishers(rows, (r, rank) => { r.overallRank = rank; });

  // Category rank
  const categoryGroups: Record<string, T[]> = {};
  rows.forEach(r => {
    if (!categoryGroups[r.categoryId]) categoryGroups[r.categoryId] = [];
    categoryGroups[r.categoryId].push(r);
  });

  for (const catId in categoryGroups) {
    const group = categoryGroups[catId];
    group.sort(byTime);
    placeFinishers(group, (r, rank) => { r.categoryRank = rank; });
  }

  // Gender rank per category
  for (const catId in categoryGroups) {
    const group = categoryGroups[catId];

    const maleGroup = group.filter(r => {
      const g = r.gender.trim().toLowerCase();
      return g === 'male' || g === 'm';
    });
    maleGroup.sort(byTime);
    placeFinishers(maleGroup, (r, rank) => { r.genderRank = rank; });

    const femaleGroup = group.filter(r => {
      const g = r.gender.trim().toLowerCase();
      return g === 'female' || g === 'f';
    });
    femaleGroup.sort(byTime);
    placeFinishers(femaleGroup, (r, rank) => { r.genderRank = rank; });
  }

  return rows;
}
