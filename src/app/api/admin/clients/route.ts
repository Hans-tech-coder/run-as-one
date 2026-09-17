import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { platformActor } from '../platform-actor';

/**
 * Every client submission, with the application it arrived as and the
 * sign-ins it has been given (ADMIN_MERGE_PLAN.md, Batch 3).
 *
 * The application columns and the viewers travel with the list rather than
 * behind a per-row request, as the organizer list did: tens of rows of short
 * text, and a panel that opens instantly instead of on a spinner. A viewer's
 * invitation token never leaves the server — only whether one is waiting and
 * when it expires, which is what the panel's state badge is derived from.
 *
 * `platform:manage` only: this is Run As One's own queue, and it carries every
 * applicant's phone number.
 */
export async function GET() {
  try {
    const { actor, refusal } = await platformActor();
    if (refusal) return refusal;

    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        invitedAt: true,
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
        _count: { select: { events: true } },
        viewers: {
          where: { organizerId: actor.orgId, role: 'VIEWER' },
          orderBy: { invitedAt: 'asc' },
          select: {
            id: true,
            invitedAt: true,
            acceptedAt: true,
            suspendedAt: true,
            inviteExpiresAt: true,
            staff: { select: { name: true, email: true, status: true } },
          },
        },
      },
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error('Failed to fetch clients:', error);
    return NextResponse.json({ error: 'The clients could not be loaded.' }, { status: 500 });
  }
}
