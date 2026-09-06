/**
 * The running club a runner represents, and the shared list they pick it from.
 *
 * The list is one master set across every event rather than a per-event one.
 * A club like "CONCEPCION UNITED RUNNERS" shows up at race after race, and an
 * organizer creating their first event should not have to retype fifty clubs
 * that another organizer already collected.
 *
 * A runner may write in a club that is not on the list yet. That write-in is
 * stored on their registration immediately — it is their answer, and it is not
 * the super admin's to withhold — but it stays out of everyone else's
 * suggestions until the super admin approves it, so one person's typo does not
 * become the name the next fifty people click.
 */

/** The answer for someone who runs with no club. Also an option on the list. */
export const INDEPENDENT_RUNNER = 'INDEPENDENT RUNNER';

/** A club's name is stored as typed; anything longer than this is not a name. */
export const MAX_COMMUNITY_NAME_LENGTH = 80;

/** Approved entries are what the pickers suggest. */
export const COMMUNITY_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
} as const;

export type CommunityStatus =
  (typeof COMMUNITY_STATUS)[keyof typeof COMMUNITY_STATUS];

/**
 * A club name, tidied but otherwise left alone.
 *
 * Curly apostrophes become straight ones because phone keyboards produce them
 * and desktop keyboards do not, which would otherwise split one club into two
 * entries that look identical on screen.
 */
export function normalizeCommunityName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_COMMUNITY_NAME_LENGTH);
}

/**
 * The key uniqueness is enforced on.
 *
 * Case folds away, so "Team Army" cannot join a list that already has
 * "TEAM ARMY". Punctuation is deliberately kept: "HASHEM ACADEMY INC." and a
 * hypothetical "HASHEM ACADEMY INC" are close enough that merging them
 * automatically would be a guess, and the super admin can merge by hand.
 */
export function communitySlug(name: string): string {
  return normalizeCommunityName(name).toUpperCase();
}

/**
 * What gets stored on a runner.
 *
 * The field is optional in the form, so a blank answer lands on
 * INDEPENDENT_RUNNER rather than an empty string. That keeps the registrants
 * export free of holes and makes a club tally add up to the head count.
 *
 * Uppercased, like every other registrant field (see text-case.ts): the club
 * is read back in the admin table, the CSV export and the emails, and
 * INDEPENDENT_RUNNER — the default sitting beside it in the same column — has
 * always been uppercase. A picker that snaps a write-in to an approved club's
 * own casing runs before this, so the club is still matched on the list's terms
 * and only the stored casing is ours.
 */
export function asRunnerCommunity(value: unknown): string {
  return normalizeCommunityName(value).toUpperCase() || INDEPENDENT_RUNNER;
}

/**
 * Whether a write-in is worth creating a pending row for.
 *
 * A name with no letter in it is a stray keystroke, not a club, and
 * INDEPENDENT_RUNNER is seeded already.
 */
export function isNewCommunityWorthKeeping(name: string): boolean {
  const trimmed = normalizeCommunityName(name);
  if (!trimmed) return false;
  if (communitySlug(trimmed) === INDEPENDENT_RUNNER) return false;
  return /\p{L}/u.test(trimmed);
}

/**
 * The starting list, taken from the Tarlac Meet and Run 2026 Google Form
 * question "WHICH RUNNING COMMUNITY/IES DO YOU REPRESENT?".
 *
 * Applied by the migration that creates the table, so a fresh deploy has these
 * on day one. Kept here as well so the dev seed and any future import share one
 * source rather than drifting apart.
 */
export const SEED_RUNNING_COMMUNITIES: readonly string[] = [
  '4-11 RUNNERS',
  'ACA GROUP',
  'ATHLETE X',
  'CAFA RUNNING CLUB',
  'COFFEE AND MILES CLUB',
  'CONCEPCION UNITED RUNNERS',
  'CONCEPCION RIOT',
  'CRESENDO RUNNING COMMUNITY',
  'DEPED TARLAC RUNNING COMMUNITY',
  'FIREFOX RUNNING COMMUNITY',
  'FITNESS GYM RUNNERS',
  'GERONA ASPIRING RUNNERS',
  'GERUNA RUNNING CLUB',
  'GRASSLAND RUNNING COMMUNITY',
  'GRIND ATHLETICS',
  'HASHEM ACADEMY INC.',
  INDEPENDENT_RUNNER,
  'IRONMILER RUNNING COMMUNITY',
  "KAI'S RUNNING COMMUNITY",
  'LA PAZ RUNNING COMMUNITY',
  'LUCINDA RUNNERS',
  'MALIWALO RUNNING COMMUNITY',
  'MC PARK RUNNER TEAM',
  'MODICUM TARLAC RUNNING COMMUNITY',
  'NACIA RUNNING COMMUNITY',
  'NCC RUNNING COMMUNITY',
  'NUEVA ECIJA RUNNERS',
  'PAMBATO RUNNERS',
  'PANGASINAN RUN CLUB',
  'PANIQUI RUNNING CLUB',
  'PHT TARLAC',
  'PRC PIRIT RUNNING COMMUNITY',
  'RED IRON',
  'ROTARUNNERS',
  'RUN PGT',
  "RUNNER'S HIGH",
  'RUN TARLAC LUCINDA RUNNERS',
  'SAN PABLO RUNNING COMMUNITY',
  'SAN RAFAEL RUNNING COMMUNITY',
  'SAPANG MARAGUL COMMUNITY',
  'SOLIDO RUNNING COMMUNITY',
  'SOLO RUNNING CLUB',
  'SOUTHWOODS RUN CLUB',
  'TEAM ARMY',
  'TEAM AURUM',
  'TEAM TSAPSUY',
  'THE BARELY RUNNING COMMUNITY',
  'THE COMMUNITY RUNNER',
  'THE VALENTIN FAMILY RUNNING CLUB',
  'TMP',
  'TRAINING GROUND RUNNING CLUB',
  'UP AND RUNNING CLUB',
  'VICTORIA RUNNING COMMUNITY',
];
