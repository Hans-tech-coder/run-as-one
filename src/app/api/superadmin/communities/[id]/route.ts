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
 * Approve, rename, or reject one running club.
 *
 * Rejecting deletes the row rather than parking it in a REJECTED state. The
 * runner who wrote it in keeps their answer either way — that is stored on the
 * runner as text — so a rejected row holds nothing worth keeping, and leaving
 * them around would grow a queue the super admin has to re-read every visit.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, name } = body;

    const dataToUpdate: { status?: string; name?: string; slug?: string } = {};

    if (status !== undefined) {
      if (status !== COMMUNITY_STATUS.APPROVED && status !== COMMUNITY_STATUS.PENDING) {
        return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
      }
      dataToUpdate.status = status;
    }

    if (name !== undefined) {
      const cleaned = normalizeCommunityName(name);
      if (!isNewCommunityWorthKeeping(cleaned)) {
        return NextResponse.json({ error: 'Enter a club name.' }, { status: 400 });
      }
      dataToUpdate.name = cleaned;
      // The slug is derived, never posted — otherwise a rename could leave two
      // rows able to claim the same name.
      dataToUpdate.slug = communitySlug(cleaned);
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    const community = await prisma.runningCommunity.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ success: true, community });
  } catch (error: any) {
    // Renaming onto a club that already exists. That is a merge, which this
    // route deliberately does not do — say so instead of failing opaquely.
    if (error?.code === 'P2002') {
      return NextResponse.json(
        {
          error:
            'Another club already uses that name. Reject this entry instead of renaming it onto an existing one.',
        },
        { status: 409 }
      );
    }
    console.error('Failed to update running community:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await prisma.runningCommunity.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete running community:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
