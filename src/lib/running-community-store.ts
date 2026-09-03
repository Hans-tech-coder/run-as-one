import prisma from './db';
import {
  COMMUNITY_STATUS,
  asRunnerCommunity,
  communitySlug,
  isNewCommunityWorthKeeping,
  normalizeCommunityName,
} from './running-community';

/**
 * Database access for the shared list of running clubs.
 *
 * Kept apart from ./running-community, which holds the naming rules and is
 * imported by the runner-facing picker — a client component cannot pull Prisma
 * in with it.
 */

/** The names the pickers suggest, alphabetical. */
export async function approvedCommunityNames(): Promise<string[]> {
  const rows = await prisma.runningCommunity.findMany({
    where: { status: COMMUNITY_STATUS.APPROVED },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  return rows.map(row => row.name);
}

/**
 * File the clubs a batch of runners wrote in, for the super admin to review.
 *
 * Called from checkout rather than from a public endpoint of its own. A club
 * only enters the queue when someone actually registers with it, which keeps
 * the list from being writable by anyone who can reach the site.
 *
 * Never throws into the caller: a registration that has already been paid for
 * must not fail because a suggestion could not be filed.
 */
export async function recordWriteInCommunities(
  participants: ReadonlyArray<{ runningCommunity?: unknown }>,
): Promise<void> {
  try {
    // Dedupe within the order first — a family of four from one new club is one
    // suggestion, not four.
    const candidates = new Map<string, string>();
    for (const p of participants) {
      const name = normalizeCommunityName(p?.runningCommunity);
      if (!isNewCommunityWorthKeeping(name)) continue;
      candidates.set(communitySlug(name), name);
    }
    if (candidates.size === 0) return;

    const existing = await prisma.runningCommunity.findMany({
      where: { slug: { in: [...candidates.keys()] } },
      select: { slug: true },
    });
    for (const row of existing) candidates.delete(row.slug);
    if (candidates.size === 0) return;

    await prisma.runningCommunity.createMany({
      data: [...candidates].map(([slug, name]) => ({
        name,
        slug,
        status: COMMUNITY_STATUS.PENDING,
      })),
      // Two people registering with the same new club at the same moment both
      // pass the check above; the unique index settles it and this keeps the
      // loser from surfacing as an error.
      skipDuplicates: true,
    });
  } catch (error) {
    console.error('Failed to record write-in running communities:', error);
  }
}

/** What gets stored on each runner, with blanks resolved to INDEPENDENT RUNNER. */
export function runnerCommunity(participant: { runningCommunity?: unknown }): string {
  return asRunnerCommunity(participant?.runningCommunity);
}
