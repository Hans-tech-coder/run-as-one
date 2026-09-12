import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

/**
 * The feedback inbox, as the super admin sees it.
 *
 * Only the super admin. Feedback is about the platform rather than about any
 * one race, and an organizer reading it would be reading other organizers'
 * complaints about the software — and, where a sender left one, a stranger's
 * email address.
 *
 * Everything is returned in one call rather than paged. The whole table is the
 * messages people have taken the trouble to write about this app; if that ever
 * grows past a few hundred rows it will be a good problem and the screen can
 * grow a pager then, on the same furniture the admin tables already use.
 */
export async function GET() {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const feedback = await prisma.feedback.findMany({
      // Newest first, because the useful question of an inbox is what has come
      // in since last time. The unread ones are found with the filter chips
      // rather than by sorting them to the top, so the order never changes
      // under somebody who is working down the list.
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        message: true,
        name: true,
        email: true,
        pagePath: true,
        userAgent: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('Failed to fetch feedback:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
