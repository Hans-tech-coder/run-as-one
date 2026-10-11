/**
 * How a race's stored ranks are worked out: the overall rank across the whole
 * race, the category rank, and the gender rank within the category, each by
 * chip time, fastest first. Only a FINISHED row is ranked; any other status
 * keeps the 0 it came with. The time is ranked **as typed** ("1:18:56.9"), so
 * the timer's tenths break a tie the whole-second `chipTimeSecs` column would
 * lose, and equal times keep the order the rows came in. One function for the
 * upload and anything that re-ranks a race later (RESULTS_ROW_ACTIONS_PLAN.md),
 * so the two can never rank differently. Pacers are left out on read, not here
 * (`pacer-results.ts`).
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

/**
 * Sets every row's three ranks, in place, and leaves `rows` sorted fastest
 * first. Returns the same array.
 */
export function rankResults<T extends RankableResult>(rows: T[]): T[] {
  const secs = new Map(rows.map(r => [r, parseTimeToSeconds(r.chipTime)]));
  const byTime = (a: T, b: T) => secs.get(a)! - secs.get(b)!;

  // Overall rank, across the entire race
  rows.sort(byTime);
  rows.forEach((r, idx) => {
    if (r.status === 'FINISHED') {
      r.overallRank = idx + 1;
    }
  });

  // Category rank
  const categoryGroups: Record<string, T[]> = {};
  rows.forEach(r => {
    if (!categoryGroups[r.categoryId]) categoryGroups[r.categoryId] = [];
    categoryGroups[r.categoryId].push(r);
  });

  for (const catId in categoryGroups) {
    const group = categoryGroups[catId];
    group.sort(byTime);
    group.forEach((r, idx) => {
      if (r.status === 'FINISHED') r.categoryRank = idx + 1;
    });
  }

  // Gender rank per category
  for (const catId in categoryGroups) {
    const group = categoryGroups[catId];

    const maleGroup = group.filter(r => {
      const g = r.gender.trim().toLowerCase();
      return g === 'male' || g === 'm';
    });
    maleGroup.sort(byTime);
    maleGroup.forEach((r, idx) => { if (r.status === 'FINISHED') r.genderRank = idx + 1; });

    const femaleGroup = group.filter(r => {
      const g = r.gender.trim().toLowerCase();
      return g === 'female' || g === 'f';
    });
    femaleGroup.sort(byTime);
    femaleGroup.forEach((r, idx) => { if (r.status === 'FINISHED') r.genderRank = idx + 1; });
  }

  return rows;
}
