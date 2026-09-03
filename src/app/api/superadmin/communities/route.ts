import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import {
  COMMUNITY_STATUS,
  communitySlug,
  isNewCommunityWorthKeeping,
  normalizeCommunityName,
} from '@/lib/running-community';

/**
 * The shared list of running clubs, as the super admin sees it.
 *
 * Only the super admin: an organizer approving clubs would be approving them
 * for every other organizer's events too, since the list is one master set.
 */

export async function GET() {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [communities, usage] = await Promise.all([
      prisma.runningCommunity.findMany({
        select: { id: true, name: true, slug: true, status: true, createdAt: true },
        // Pending first, so the queue is the first thing on screen.
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      // How many runners have actually registered under each name. A pending
      // club with runners behind it is real; one with none is likely a typo
      // someone corrected before paying.
      prisma.runner.groupBy({
        by: ['runningCommunity'],
        _count: { _all: true },
      }),
    ]);

    const runnerCounts = new Map(
      usage.map(row => [communitySlug(row.runningCommunity), row._count._all]),
    );

    return NextResponse.json({
      communities: communities.map(c => ({
        ...c,
        runnerCount: runnerCounts.get(c.slug) ?? 0,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch running communities:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const name = normalizeCommunityName(body?.name);

    if (!isNewCommunityWorthKeeping(name)) {
      return NextResponse.json(
        { error: 'Enter a club name.' },
        { status: 400 }
      );
    }

    const slug = communitySlug(name);
    const existing = await prisma.runningCommunity.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: `"${existing.name}" is already on the list.` },
        { status: 409 }
      );
    }

    // Added by hand by the person who does the approving, so it needs no review.
    const community = await prisma.runningCommunity.create({
      data: { name, slug, status: COMMUNITY_STATUS.APPROVED },
    });

    return NextResponse.json({ success: true, community });
  } catch (error) {
    console.error('Failed to create running community:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
