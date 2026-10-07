/**
 * A timing sheet's gender as the division a runner reads: "M" and "male" are
 * "Male", "F" and "female" are "Female", and anything else is passed through as
 * written. "in M" under a rank reads as a typo, so every surface that names a
 * runner's division — the result page's gender chip and Gender Rank tile,
 * the full results table, cards and Gender filter (public and admin), the
 * e-certificate's rank tile — names it in words through this one rule.
 */
export function genderDivision(gender: string | null | undefined): string {
  const g = (gender ?? '').trim();
  if (/^m(ale)?$/i.test(g)) return 'Male';
  if (/^f(emale)?$/i.test(g)) return 'Female';
  return g;
}
