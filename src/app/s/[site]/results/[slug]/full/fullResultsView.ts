/**
 * The full leaderboard's view — search, Category, Gender and page — as the
 * address's query, so a runner can send a link that opens on their own row.
 *
 *   ?q=juan&category=5KM&category=10KM&gender=Female&page=2
 *
 * A param at its default is left out. Reading forgives: a category may be its
 * name or its id (the Race Winners page links `?category=<id>`), names and
 * genders match without regard to case, and anything that names no category,
 * no gender or no whole page is dropped. Params this view does not own (a
 * `?cert=1`, a tracking tag) are kept as they are.
 */

export interface LeaderboardView {
  q: string;
  categories: string[];
  genders: string[];
  /** Zero-based, as the table counts it. */
  pageIndex: number;
}

const OWN = ['q', 'category', 'gender', 'page'] as const;
const MAX_QUERY = 100;

/** Distinct values of `key` that match one of `options`, as `options` spells them. */
function pick(params: URLSearchParams, key: string, options: string[], ids?: Map<string, string>) {
  const picked: string[] = [];
  for (const raw of params.getAll(key)) {
    const value = raw.trim();
    const match = ids?.get(value) ?? options.find(o => o.toLowerCase() === value.toLowerCase());
    if (match && !picked.includes(match)) picked.push(match);
  }
  return picked;
}

export function readView(
  params: URLSearchParams,
  categories: { id: string; name: string }[],
  genders: string[],
): LeaderboardView {
  const ids = new Map(categories.map(c => [c.id, c.name]));
  const names = Array.from(new Set(categories.map(c => c.name)));
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').slice(0, MAX_QUERY),
    categories: pick(params, 'category', names, ids),
    genders: pick(params, 'gender', genders),
    pageIndex: Number.isInteger(page) && page > 1 ? page - 1 : 0,
  };
}

/** The query string for `view`, keeping the params of `current` this view does not own. */
export function writeView(current: URLSearchParams, view: LeaderboardView): string {
  const next = new URLSearchParams(current);
  for (const key of OWN) next.delete(key);
  const q = view.q.trim();
  if (q) next.set('q', q);
  for (const c of view.categories) next.append('category', c);
  for (const g of view.genders) next.append('gender', g);
  if (view.pageIndex > 0) next.set('page', String(view.pageIndex + 1));
  return next.toString();
}
