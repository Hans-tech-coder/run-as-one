import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';

/**
 * The trail entry for a registrant list leaving the system as a CSV.
 *
 * An export is one of the two reads the trail records (STAFF_ACCESS_PLAN.md
 * §4.3): it is how every runner's contact details, birthdate and emergency
 * contact walk out of the admin in one file, and under the Data Privacy Act
 * it is exactly what an incident review asks about.
 *
 * The file itself is built in the browser from rows the screen already holds,
 * so there is no server step to hang the record on — the registrants table
 * tells this route before it builds the file. It records only how many rows
 * and whether they were a selection, never which people or what they said.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const event = await prisma.event.findFirst({
      where: { id, organizerId: actor.orgId },
      select: { id: true, title: true },
    });
    if (!event || !can(actor, 'registration:view', { organizerId: actor.orgId, eventId: id })) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const count = Math.max(0, Math.floor(Number(body?.count) || 0));
    const selected = body?.selected === true;

    await recordAudit(prisma, actor, {
      action: 'registrants.exported',
      entityType: 'Event',
      entityId: event.id,
      eventId: event.id,
      summary: `Exported ${count} registrant${count === 1 ? '' : 's'} from ${event.title} to CSV${selected ? ' (selected rows)' : ''}.`,
      changes: { rows: count, selection: selected },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Registrant export log error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
