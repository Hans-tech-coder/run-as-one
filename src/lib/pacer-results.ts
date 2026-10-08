/**
 * Which finishers on a race's results are its pacers, and the ranks once they
 * are left out — a pacer runs to a set pace for the field, so they are kept off
 * the podium and hold no place. Split from `pacer.ts`, which owns what a pacer
 * code is; this owns how a pacer is found in an uploaded results sheet.
 */
import { normalizeBibNumber, normalizePacerName } from '@/lib/pacer';

/** What the results matcher needs to know about one pacer. */
export interface PacerIdentity {
  assigneeName: string | null;
  bibNumber: string | null;
  /** The category the pacer's code is locked to, or null if it was deleted. */
  categoryId: string | null;
  /** The group this pacer leads ("SUB1", "1:00"), for their certificate. */
  paceGroup?: string | null;
}

/** What the results matcher needs to know about one finisher. */
export interface ResultIdentity {
  bibNumber: string;
  name: string;
  categoryId: string;
}

/**
 * Which finishers on the public results are pacers.
 *
 * **A pacer is not eligible for the podium.** They run to a set pace for the
 * field, so a pacer finishing third would take an award from a runner who
 * actually raced for it. The Race Winners board leaves them out and the full
 * leaderboard tags them. They hold no place either: every page that prints a
 * rank reads it from `ranksWithoutPacers`, which prints a pacer's ranks as "-"
 * and moves the runners behind them up.
 *
 * A finisher is a pacer when either holds:
 *
 *  - **Their bib is a pacer's bib**, anywhere in the event. Bibs are unique per
 *    race, so this is the reliable match, and it is why staff can set the bib
 *    late through *Edit*.
 *  - **Their name is a pacer's name, in that pacer's category.** The fallback
 *    for a pacer whose bib was never entered or changed on race day. Limited to
 *    the pacer's own category so a namesake running another distance is not
 *    pulled off their podium.
 *
 * Names go through `normalizePacerName` and bibs through `normalizeBibNumber`
 * on both sides, since an uploaded sheet is whatever casing the timer used.
 */
export function pacerResultMatcher(
  pacers: readonly PacerIdentity[],
): (result: ResultIdentity) => boolean {
  const pacerFor = pacerForResult(pacers);
  return result => pacerFor(result) !== null;
}

/**
 * The pacer behind a finisher, by the same two rules as `pacerResultMatcher`
 * (bib first, then name within the pacer's category), or null for a runner who
 * is not one. For the one thing a result row needs beyond the yes or no: the
 * pace group printed on that pacer's own certificate.
 */
export function pacerForResult(
  pacers: readonly PacerIdentity[],
): (result: ResultIdentity) => PacerIdentity | null {
  const byBib = new Map<string, PacerIdentity>();
  const byName = new Map<string, PacerIdentity>();
  for (const pacer of pacers) {
    const bib = normalizeBibNumber(pacer.bibNumber);
    if (bib) byBib.set(bib, pacer);
    const name = normalizePacerName(pacer.assigneeName);
    if (name && pacer.categoryId) byName.set(`${pacer.categoryId}|${name}`, pacer);
  }

  return result =>
    byBib.get(normalizeBibNumber(result.bibNumber)) ??
    byName.get(`${result.categoryId}|${normalizePacerName(result.name)}`) ??
    null;
}

/** What the ranking needs to know about one finisher, on top of who they are. */
export interface RankedResult extends ResultIdentity {
  id: string;
  gender: string;
  /** As uploaded; 0 for anyone who did not finish. */
  categoryRank: number;
  /** As uploaded, within the category; 0 for anyone who did not finish. */
  genderRank: number;
}

/** A finisher's place once pacers are left out. Null ranks print as "-". */
export interface PacerAwareRanks {
  isPacer: boolean;
  categoryRank: number | null;
  genderRank: number | null;
}

/** The division a gender rank is counted in, the way the upload route groups it. */
function genderKey(gender: string): string | null {
  const g = gender.trim().toLowerCase();
  if (g === 'male' || g === 'm') return 'M';
  if (g === 'female' || g === 'f') return 'F';
  return null;
}

/**
 * Category and gender ranks **without the pacers** (owner, 2026-10-07).
 *
 * A pacer is not racing, so they hold no place: their ranks are null ("-")
 * and everyone behind them moves up one for each pacer ahead of them in the
 * same group — the category for Category Rank, the category's gender
 * division for Gender Rank. The row itself stays where its time puts it.
 *
 * **Subtracted, not re-sorted.** The uploaded rank is the timer's ordering,
 * ties included, and taking away the pacers ahead keeps that ordering exactly
 * rather than inventing a second one from chip times.
 *
 * Worked out on read, never written back: the upload stays the timing
 * company's raw sheet, and a bib entered or changed later moves every rank at
 * once without a re-upload. Every page that prints a rank — the full
 * leaderboard, a runner's page and certificate, the admin Race Results — reads
 * it from here, so a runner is never #1 in one place and 2nd in another.
 *
 * `results` must hold **every** result of each category it ranks (the pacers
 * ahead are what is counted). A rank of 0 means "did not finish" and is left
 * as it is.
 *
 * **Only a pacer who finished moves anyone up.** The rank is the test, not the
 * status: the upload route ranks FINISHED rows only and gives every DNF, DNS or
 * DQ row a 0, and a pacer's 0 is never counted as ahead. So a caller may pass
 * its rows with or without a status filter (the admin table passes them all,
 * the full leaderboard passes finishers only) and the ranks still agree.
 */
export function ranksWithoutPacers(
  results: readonly RankedResult[],
  isPacer: (result: ResultIdentity) => boolean,
): Map<string, PacerAwareRanks> {
  const pacerFlags = new Map(results.map(result => [result.id, isPacer(result)]));

  // The uploaded ranks the pacers hold, per group.
  const pacerCategoryRanks = new Map<string, number[]>();
  const pacerGenderRanks = new Map<string, number[]>();
  for (const result of results) {
    if (!pacerFlags.get(result.id)) continue;
    if (result.categoryRank > 0) push(pacerCategoryRanks, result.categoryId, result.categoryRank);
    const gender = genderKey(result.gender);
    if (gender && result.genderRank > 0) {
      push(pacerGenderRanks, `${result.categoryId}|${gender}`, result.genderRank);
    }
  }

  const ranks = new Map<string, PacerAwareRanks>();
  for (const result of results) {
    if (pacerFlags.get(result.id)) {
      ranks.set(result.id, { isPacer: true, categoryRank: null, genderRank: null });
      continue;
    }
    const gender = genderKey(result.gender);
    ranks.set(result.id, {
      isPacer: false,
      categoryRank: lessPacersAhead(
        result.categoryRank,
        pacerCategoryRanks.get(result.categoryId),
      ),
      genderRank: lessPacersAhead(
        result.genderRank,
        gender ? pacerGenderRanks.get(`${result.categoryId}|${gender}`) : undefined,
      ),
    });
  }
  return ranks;
}

function push(groups: Map<string, number[]>, key: string, rank: number) {
  const list = groups.get(key);
  if (list) list.push(rank);
  else groups.set(key, [rank]);
}

/** This rank, less one for each pacer ranked ahead of it. 0 stays 0. */
function lessPacersAhead(rank: number, pacerRanks: number[] | undefined): number {
  if (rank <= 0 || !pacerRanks) return rank;
  return rank - pacerRanks.filter(pacerRank => pacerRank < rank).length;
}
