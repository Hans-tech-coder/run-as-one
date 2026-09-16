import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

/**
 * Moves an organizer's status, and nothing else.
 *
 * This route used to take `adminFee` as well. That column is read by nothing
 * that charges a runner — every peso comes from `Event.adminFee`, which the
 * organizer sets per event — so a body carrying it is refused by name rather
 * than silently ignored: a caller still sending it believes it changes a fee,
 * and it does not.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (body?.adminFee !== undefined) {
      return NextResponse.json(
        {
          error:
            'The admin fee is no longer set per organizer. Organizers set it on each event.',
        },
        { status: 400 },
      );
    }

    const { status } = body ?? {};
    if (status === undefined) {
      return NextResponse.json({ error: 'No data provided to update' }, { status: 400 });
    }

    const updatedOrganizer = await prisma.organizer.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });

    return NextResponse.json({ success: true, organizer: updatedOrganizer });
  } catch (error) {
    console.error('Failed to update organizer:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
