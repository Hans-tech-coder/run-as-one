import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { changedFields, listFields, recordAudit } from '@/lib/audit';
import { parseCertificateSettings, serializeCertificateSettings } from '@/lib/certificate-settings';

/**
 * A race's e-certificate on its own: the template and how it is drawn
 * (`lib/certificate-settings.ts`). The results workspace saves through here
 * (RESULTS_NAV_PLAN.md, Batch 2).
 *
 * Separate from `PUT /api/admin/events/[id]` because that one replaces the
 * whole event — categories, bank accounts, fees — and a screen that only shows
 * the certificate would have to hold and re-post every field it does not show.
 *
 * Scoped like every handler under this id: the event must be the actor's own
 * organizer's, and the actor must hold `event:edit` on it. A miss is a 404
 * either way, so the answer never confirms that someone else's event exists.
 */

const CERTIFICATE_FIELDS = ['certificateTemplate', 'certificateCoordinates'] as const;

/**
 * The template as stored: a URL our upload returned, or null for Run As One's
 * own certificate. Undefined when the body is not one of those, so a malformed
 * save is refused rather than stored — runners' browsers fetch this address.
 */
function asTemplate(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  return /^https:\/\//.test(value) ? value : undefined;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const data = await request.json().catch(() => null);

    const certificateTemplate = asTemplate(data?.certificateTemplate);
    if (certificateTemplate === undefined) {
      return NextResponse.json(
        { error: 'The certificate template must be an uploaded file. Upload it again and save.' },
        { status: 400 },
      );
    }
    if (typeof data?.certificateCoordinates !== 'string') {
      return NextResponse.json({ error: 'The certificate layout is missing. Reload the page and try again.' }, { status: 400 });
    }
    // Read and written back through the one parser, so the column only ever
    // holds a shape the certificate drawer understands.
    const certificateCoordinates = serializeCertificateSettings(parseCertificateSettings(data.certificateCoordinates));

    const current = await db.event.findFirst({
      where: { id, organizerId: actor.orgId },
      select: { id: true, title: true, certificateTemplate: true, certificateCoordinates: true },
    });
    if (!current || !can(actor, 'event:edit', { organizerId: actor.orgId, eventId: id })) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const saved = await db.$transaction(async (tx) => {
      const ev = await tx.event.update({
        where: { id },
        data: { certificateTemplate, certificateCoordinates },
        select: { certificateTemplate: true, certificateCoordinates: true },
      });
      const changes = changedFields(current, ev, CERTIFICATE_FIELDS);
      if (Object.keys(changes).length > 0) {
        await recordAudit(tx, actor, {
          action: 'event.updated',
          entityType: 'Event',
          entityId: id,
          eventId: id,
          summary: `Edited event ${current.title}: ${listFields(Object.keys(changes))}.`,
          changes,
        });
      }
      return ev;
    });

    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    console.error('Update certificate error:', error);
    return NextResponse.json({ error: 'Failed to save the certificate' }, { status: 500 });
  }
}
