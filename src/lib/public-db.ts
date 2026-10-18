import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import prisma, { PUBLIC_DATA_TAG } from './db';

/**
 * Public pages read the database through a cache, so a visitor nobody is
 * expecting — a crawler, a link preview, an uptime check at 3am — does not
 * wake the Neon compute.
 *
 * Neon bills by the minutes its compute is awake, and every query wakes it for
 * at least five. In October 2026 the public pages read on every request, and
 * the compute was up about 85% of the day, mostly for visitors who were not
 * people (docs/current-state.md).
 *
 * **The rule:** a page anybody can open without signing in reads through
 * `publicDb`, never through `db`. It is the same Prisma client with every read
 * cached under `PUBLIC_DATA_TAG`, keyed by the model, the operation and its
 * arguments. A write cannot go through it; it throws.
 *
 * **Fresh on every write.** lib/db.ts expires the tag after any write, so what
 * an organizer just changed is on the next page anybody opens. A cached read
 * also lapses after SAFETY_NET_SECONDS, for a change made outside the app, in
 * the Neon console for instance.
 *
 * **Only the data is cached, never the page.** The pages stay
 * `force-dynamic` and judge the clock at request time — opened, paused,
 * finished, full — against cached rows, so a badge is as right as it was when
 * every read went to the database. The one clock in a `where` clause, the
 * publish cut-off, goes through `publishCutoff()` so its key does not change
 * every millisecond.
 *
 * Rows come back from the cache as JSON, so each `Date` is stored tagged and
 * turned back into a `Date` here; a caller sees what Prisma would have handed
 * it, and a text column that merely looks like a timestamp stays a string.
 */

/** A safety net, not the freshness rule — writes clear the tag at once. */
const SAFETY_NET_SECONDS = 3600;

const READS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** The key a `Date` is stored under in the cache, so only real dates are revived. */
const DATE_TAG = '$publicDbDate';

function tagDates(value: unknown): unknown {
  if (value instanceof Date) return { [DATE_TAG]: value.toISOString() };
  if (Array.isArray(value)) return value.map(tagDates);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, tagDates(item)]));
  }
  return value;
}

function reviveDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === 'object') {
    const tagged = (value as Record<string, unknown>)[DATE_TAG];
    if (typeof tagged === 'string') return new Date(tagged);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveDates(item)]));
  }
  return value;
}

const extended = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!READS.has(operation)) {
          throw new Error(`publicDb is read-only: ${model}.${operation} must go through db.`);
        }
        const read = unstable_cache(
          async () => tagDates(await query(args)),
          ['public-db', model, operation, JSON.stringify(args ?? null)],
          { tags: [PUBLIC_DATA_TAG], revalidate: SAFETY_NET_SECONDS },
        );
        return reviveDates(await read());
      },
    },
  },
});

/**
 * Typed as the plain client so it can be handed to any helper that takes one;
 * its writes exist on the type but throw.
 */
const publicDb = extended as unknown as typeof prisma;

export default publicDb;

/**
 * The newest publish time that has already passed, for `publishedEvents()`.
 *
 * `publishAt <= now` would make a new cache key every request. Every instant
 * between the last publish time that has passed and the next one selects the
 * same events, so this hands over the last one instead: the key holds until
 * the next scheduled event goes live, and then that event is on the very next
 * page, not an hour later.
 */
export const publishCutoff = cache(async (): Promise<Date> => {
  const now = Date.now();
  const rows = await publicDb.event.findMany({
    where: { publishAt: { not: null } },
    select: { publishAt: true },
  });
  let cutoff = 0;
  for (const { publishAt } of rows) {
    const at = publishAt ? publishAt.getTime() : 0;
    if (at <= now && at > cutoff) cutoff = at;
  }
  return new Date(cutoff);
});
