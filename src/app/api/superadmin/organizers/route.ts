import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

/**
 * Every organizer account, with the application it was created from.
 *
 * The application columns travel with the list rather than behind a second
 * per-row request: the table holds tens of rows, each column is short text,
 * and the panel that reads them opens instantly instead of on a spinner.
 *
 * `Organizer.adminFee` is deliberately not selected. Nothing a runner is
 * charged reads it — the fee on an order comes from `Event.adminFee`, which
 * the organizer sets per event — so the screen that used to edit it was a
 * control with no effect, and it was removed.
 */
export async function GET() {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizers = await prisma.organizer.findMany({
      where: { role: 'ORGANIZER' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        orgType: true,
        contactFirstName: true,
        contactLastName: true,
        contactRole: true,
        phone: true,
        city: true,
        province: true,
        website: true,
        experience: true,
        services: true,
        firstEventName: true,
        firstEventDate: true,
        firstEventLocation: true,
        expectedRunners: true,
        applicationNote: true,
        _count: {
          select: { events: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ organizers });
  } catch (error) {
    console.error('Failed to fetch organizers:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
