import type { ResultRow } from './results-sheet';

/**
 * A results file that has been read, mapped and checked but not sent yet:
 * what `ResultsUploaderClient` hands back in its `onPrepared` mode, and what
 * `postResults` sends. /admin/results/new holds one until its single Save,
 * because a results-only race has no id to upload against before then.
 */
export type PreparedResults = {
  results: ResultRow[];
  /** Categories this upload creates from sheet names (results-only races only). */
  newCategories: { name: string; distance: string }[];
  /** The sheets that gave rows, for the summary the page shows. */
  sheets: string[];
  /** Sheets set to import that turned out to hold no usable rows. */
  skippedSheets: string[];
};

/**
 * Sends the rows to the race's upload route, which replaces its results and
 * computes the ranks. Returns how many finishers were stored; throws with the
 * route's own words when it refuses, so the caller can show them as they are.
 */
export async function postResults(
  eventId: string,
  prepared: Pick<PreparedResults, 'results' | 'newCategories'>,
): Promise<number> {
  const res = await fetch(`/api/admin/events/${eventId}/results/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results: prepared.results, newCategories: prepared.newCategories }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.count;
}
