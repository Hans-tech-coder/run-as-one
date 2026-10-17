import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit, type AuditEntry } from '@/lib/audit';
import { formatEventInstant } from '@/lib/event-schedule';
import {
  PUBLISH_INSTANT_ERROR,
  asPublishInstant,
  publishConflict,
  publishState,
} from '@/lib/event-visibility';

/**
 * When the public first sees an event: publish it now, schedule it, or take it
 * back to a draft (EVENT_PUBLISH_PLAN.md).
 *
 * Its own route rather than another field on PUT or PATCH of the event: the
 * events table and its modal change only this, and the edit form never sends
 * it, so nothing that saves the rest of the event can publish or hide it by
 * accident.
 *
 * Body: `{ publishAt: 'now' | <ISO instant> | null }`.
 *
 * Hiding an event that already has registrations — a draft, or a schedule
 * still ahead — is refused (D5): those runners hold a page and receipts that
 * point at it. Pause or close sign-ups instead.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'publishAt')) {
      return NextResponse.json({ error: 'Send publishAt.' }, { status: 400 });
    }

    const publishAt = asPublishInstant(body.publishAt);
    if (publishAt === undefined) {
      return NextResponse.json({ error: PUBLISH_INSTANT_ERROR }, { status: 400 });
    }

    const event = await db.event.findUnique({
      where: { id },
      select: {
        id: true,
        organizerId: true,
        title: true,
        publishAt: true,
        registrationOpensAt: true,
        _count: { select: { registrations: true } },
      },
    });

    // An event the actor may not edit reads exactly like one that does not
    // exist, as on the event's other routes.
    if (!event || !can(actor, 'event:edit', { organizerId: event.organizerId, eventId: id })) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const next = publishState({ publishAt });
    const stayPublic = `${event.title} already has registrations, so it has to stay public. Pause or close sign-ups instead.`;
    if (next !== 'PUBLISHED' && event._count.registrations > 0) {
      return NextResponse.json({ error: stayPublic }, { status: 409 });
    }

    const conflict = publishConflict(publishAt, event.registrationOpensAt);
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      // Recounted under a lock before hiding the event: a checkout holds the
      // row `FOR SHARE` while it writes (lockEventForRegistration), so an
      // order already in flight lands first and is counted here, and one that
      // starts after reads the event as unpublished and is refused.
      if (next !== 'PUBLISHED') {
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id} FOR UPDATE`;
        if ((await tx.registration.count({ where: { eventId: id } })) > 0) return null;
      }

      const row = await tx.event.update({
        where: { id },
        data: { publishAt },
        select: { id: true, publishAt: true },
      });

      const before = event.publishAt?.toISOString() ?? null;
      const after = row.publishAt?.toISOString() ?? null;
      if (before !== after) {
        const entry: Pick<AuditEntry, 'action' | 'summary'> =
          next === 'DRAFT'
            ? { action: 'event.unpublished', summary: `Moved ${event.title} back to draft.` }
            : next === 'SCHEDULED'
              ? {
                  action: 'event.publish.scheduled',
                  summary: `Scheduled ${event.title} to publish ${formatEventInstant(row.publishAt!)}.`,
                }
              : { action: 'event.published', summary: `Published ${event.title}.` };
        await recordAudit(tx, actor, {
          ...entry,
          entityType: 'Event',
          entityId: id,
          eventId: id,
          organizerId: event.organizerId,
          changes: { publishAt: [before, after] },
        });
      }

      return row;
    });

    if (!updated) {
      return NextResponse.json({ error: stayPublic }, { status: 409 });
    }

    return NextResponse.json({ ...updated, publishState: next });
  } catch (error) {
    console.error('Publish event error:', error);
    return NextResponse.json({ error: 'Failed to update publishing' }, { status: 500 });
  }
}
