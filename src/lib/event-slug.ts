/**
 * The piece of an event's URL a runner actually reads.
 *
 * Events used to be addressed by their cuid — /events/cmtmj0qqe00006getf0b15627
 * — which is fine for a database and useless for a person. An organizer pastes
 * that link into a Facebook post and nobody can tell which race it points at.
 * So every event now carries a slug derived from its title, and that is what
 * the public routes use: /events/tagaytay-trail-run-2026.
 *
 * The slug is stored rather than recomputed on every request because it has to
 * be unique — two organizers will eventually both call their event "Fun Run" —
 * and uniqueness is something only the database can settle.
 */

/**
 * The longest slug we will generate. Long enough for a real event title,
 * short enough that the URL still fits in a message without wrapping.
 */
const MAX_SLUG_LENGTH = 80;

/**
 * What a title with nothing sluggable in it becomes. Rare, but a title that is
 * all punctuation or all non-Latin script would otherwise reduce to an empty
 * string, and an empty path segment is not a URL.
 */
const FALLBACK_SLUG = 'event';

/**
 * Turn an event title into the lowercase, hyphenated form used in URLs.
 *
 * Accents are folded to their base letters (Bagumbayán → bagumbayan) so a
 * Filipino title still produces an ASCII path. Apostrophes are dropped rather
 * than hyphenated, because "Runner's Cup" reads better as runners-cup than as
 * runner-s-cup.
 *
 * The result is not guaranteed unique — see uniqueEventSlug for that.
 */
export function slugifyEventTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    // Strip the combining marks NFKD just split off the base letters.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG_LENGTH)
    // Trimmed last, so a slice that lands mid-word cannot leave a trailing dash.
    .replace(/^-+|-+$/g, '');

  return slug || FALLBACK_SLUG;
}

/**
 * How many "-2", "-3" suffixes to try before giving up on a readable slug.
 * Reaching this means something is wrong — an organizer creating hundreds of
 * identically titled events — and a random suffix is a better answer than a
 * loop that never ends.
 */
const MAX_SUFFIX_ATTEMPTS = 50;

/**
 * The slug to store for a title, given a way to ask whether one is already
 * taken. Collisions get a counter: fun-run, fun-run-2, fun-run-3.
 *
 * `isTaken` is passed in rather than queried here so the caller can scope the
 * check — an edit has to ignore the row it is editing, or an event would
 * collide with itself every time it was saved without a title change.
 */
export async function uniqueEventSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyEventTitle(title);

  if (!(await isTaken(base))) return base;

  for (let suffix = 2; suffix <= MAX_SUFFIX_ATTEMPTS; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

/**
 * A Prisma `where` that finds an event from whatever the URL carried.
 *
 * Both are matched because the cuid links minted before slugs existed are out
 * in the world already — printed on posters, sitting in someone's messages —
 * and breaking them would strand runners mid-registration. A page that matches
 * on the id should send the visitor on to the slug URL; see canonicalEventPath.
 */
export function eventByParam(param: string) {
  return { OR: [{ slug: param }, { id: param }] };
}

/**
 * Where a visitor who arrived on an old cuid link belongs, or null if the URL
 * they used is already the canonical one.
 *
 * `suffix` is whatever follows the event segment — '/register' — so every route
 * under /events can reuse this. Results live in their own section of the site
 * and have their own version of this; see canonicalResultsPath.
 */
export function canonicalEventPath(
  event: { slug: string },
  param: string,
  suffix = '',
): string | null {
  return param === event.slug ? null : `/events/${event.slug}${suffix}`;
}

/**
 * The same rule for the results section: /results/[slug], /results/[slug]/full
 * and /results/[slug]/[bib].
 *
 * A finished race whose times are published is not something you sign up for
 * any more, so it does not live under /events — it lives under /results, which
 * is the part of the site a runner is actually in when they open it. That the
 * two sections need two of these is the price of that, and a small one: the
 * cuid links printed on old posters still resolve, they just land in the
 * section the page belongs to.
 */
export function canonicalResultsPath(
  event: { slug: string },
  param: string,
  suffix = '',
): string | null {
  return param === event.slug ? null : `/results/${event.slug}${suffix}`;
}

/** Where a race's published times live. The one place this path is spelled. */
export function resultsPath(event: { slug: string }, suffix = ''): string {
  return `/results/${event.slug}${suffix}`;
}

/**
 * One runner's result page, addressed by the number they wore.
 *
 * The bib is used rather than the row's cuid because this is the link a runner
 * actually shares — texted to a friend, pasted into a group chat — and
 * /results/bizrun-v2-0/1042 is a link they can read, recognise as theirs and
 * even type from memory, where
 * /results/bizrun-v2-0/cmtttip8j00n9s4etkrlnn7n0 is a link they can only
 * copy. `@@unique([eventId, bibNumber])` on RaceResult is what makes it a
 * valid address: within one race, a bib points at exactly one runner.
 *
 * The cuid is kept as a fallback for the one case the bib cannot cover — a
 * results sheet uploaded with a blank bib column, which the importer does not
 * currently reject. Such a row would otherwise have no address at all, and the
 * bare event path is the winners board, not that runner.
 */
export function runnerResultPath(
  event: { slug: string },
  result: { id: string; bibNumber: string },
): string {
  const bib = result.bibNumber?.trim();
  return `/results/${event.slug}/${encodeURIComponent(bib || result.id)}`;
}
