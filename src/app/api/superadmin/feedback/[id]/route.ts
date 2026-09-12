import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { asFeedbackStatus } from '@/lib/feedback';

/**
 * Marking one message read, or throwing one away.
 *
 * The triage mark is the whole of PATCH. There is nothing else on this row the
 * platform owner is allowed to change: the message, the name and the address
 * are what somebody else wrote, and an inbox that can edit its own mail is an
 * inbox whose contents cannot be trusted later.
 *
 * DELETE is here for what a public form on the open internet eventually
 * attracts — spam, and the same message sent four times by somebody who
 * thought the first three had failed. It is a genuine delete rather than a
 * status, because unlike a registration there is no person on the other side
 * of the row waiting on it: nothing in the product reads this table, no email
 * is built on it, and a row kept "in case" is one more thing between the owner
 * and the messages that matter. The screen still asks before it does it.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const status = asFeedbackStatus(body?.status);

    if (!status) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    }

    const feedback = await prisma.feedback.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    console.error('Failed to update feedback:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await prisma.feedback.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete feedback:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
