/**
 * Refuses to let a maintenance script run against the live database.
 *
 * Local development and production used to share one Neon branch, so every
 * seed and backfill in this folder was one forgotten terminal away from
 * rewriting real customer orders — including bank-transfer registrations
 * sitting PENDING while a runner waits for their slot to be confirmed. The
 * branches are separate now (see PROJECT_GUIDE §2), and this is the guard that
 * keeps them that way: separation protects you only while nothing points the
 * wrong connection string at production.
 *
 * The check is on the **host**, not on NODE_ENV. NODE_ENV is a property of the
 * process and is "development" on a laptop no matter which database that
 * laptop is dialling; the host is the database itself, which is the thing that
 * actually gets hurt.
 *
 * Deliberately a denylist of one known host rather than an allowlist of dev
 * hosts. A new dev branch gets a new hostname every time, and an allowlist
 * would refuse the branch you just made — a guard that cries wolf is a guard
 * that gets commented out. The production endpoint, by contrast, changes only
 * when somebody deliberately moves it, and this constant moves with it.
 */

/** The compute endpoint the live site runs on (Neon branch br-calm-darkness-b3tqh63k). */
export const PRODUCTION_DB_HOST = 'ep-still-pine-b3n210bs';

/**
 * Throws unless DATABASE_URL/DIRECT_URL point somewhere other than production.
 *
 * `label` names the script in the error, so the message says what was stopped
 * rather than only that something was.
 */
export function assertNotProduction(label: string): void {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(
    (url): url is string => typeof url === 'string' && url.length > 0
  );

  if (urls.length === 0) {
    throw new Error(
      `${label}: DATABASE_URL is not set, so there is no way to tell which ` +
        `database this would write to. Refusing to run.`
    );
  }

  if (urls.some((url) => url.includes(PRODUCTION_DB_HOST))) {
    throw new Error(
      `${label}: this is pointed at the PRODUCTION database ` +
        `(${PRODUCTION_DB_HOST}). That database holds real registrations, ` +
        `including paid and pending orders from real runners. Point .env at a ` +
        `Neon dev branch and run it again.`
    );
  }
}
