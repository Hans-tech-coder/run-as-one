import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { uploadPrivateProof, UploadError } from '@/lib/blob';
import { describeRemittance, readRemittance } from '@/lib/settlement';

/**
 * Records one remittance against one race (ADMIN_MERGE_PLAN.md, Batch 6): a
 * payout Run As One sent the organizer, or money the organizer handed back.
 *
 * Multipart, because a receipt may ride along. Every field is checked by
 * `readRemittance` — the rule the dialog runs as it is pressed — and a refusal
 * names its field under `errors`, so the dialog puts it under the right box.
 *
 * **It does not refuse a payout larger than the balance.** An organizer may be
 * paid ahead of a validation, and the balance simply reads Overpaid until the
 * orders catch up; the dialog says what the payout will leave before it is
 * pressed. What it cannot be is a figure the database then contradicts, so the
 * row and its trail entry are one transaction.
 *
 * `remittance:manage` on that event, asked of the event's own tenant. A missing
 * race and one this person may not settle answer the same 404.
 */
export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: 'The remittance could not be read. Please try again.' }, { status: 400 });
    }

    const eventId = String(form.get('eventId') ?? '');
    const event = eventId
      ? await prisma.event.findFirst({
          where: { id: eventId, organizerId: actor.orgId },
          select: { id: true, title: true, organizerId: true },
        })
      : null;
    if (!event || !can(actor, 'remittance:manage', { organizerId: event.organizerId, eventId: event.id })) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const { value, errors } = readRemittance({
      kind: form.get('kind'),
      amount: form.get('amount'),
      paidOn: form.get('paidOn'),
      method: form.get('method'),
      reference: form.get('reference'),
      note: form.get('note'),
    });
    if (!value) {
      return NextResponse.json({ error: 'Some fields need attention.', errors }, { status: 400 });
    }

    // Uploaded before the write, as checkout does with a deposit slip. A write
    // that then fails leaves one orphaned receipt in the private store, which
    // is cheaper than a remittance that says it has a receipt and has none.
    const file = form.get('proof');
    let proof: string | null = null;
    if (file instanceof File && file.size > 0) {
      try {
        proof = await uploadPrivateProof(file, 'remittances');
      } catch (error) {
        if (error instanceof UploadError) {
          return NextResponse.json({ error: error.message, errors: { proof: error.message } }, { status: 400 });
        }
        throw error;
      }
    }

    const remittance = await prisma.$transaction(async tx => {
      const row = await tx.remittance.create({
        data: {
          eventId: event.id,
          ...value,
          proof,
          recordedById: actor.id,
          recordedByName: actor.name.trim() || actor.email,
        },
      });

      const direction = value.kind === 'RETURN' ? 'from the organizer of' : 'to the organizer of';
      await recordAudit(tx, actor, {
        action: 'remittance.recorded',
        entityType: 'Remittance',
        entityId: row.id,
        eventId: event.id,
        organizerId: event.organizerId,
        summary: `Recorded a ${describeRemittance(value)} ${direction} ${event.title}, sent ${value.paidOn}${
          value.reference ? ` (ref ${value.reference})` : ''
        }.`,
        changes: {
          kind: value.kind,
          amount: value.amount,
          paidOn: value.paidOn,
          method: value.method,
          reference: value.reference,
          proof: Boolean(proof),
        },
      });
      return row;
    });

    return NextResponse.json({ id: remittance.id }, { status: 201 });
  } catch (error) {
    console.error('Record remittance error:', error);
    return NextResponse.json({ error: 'The remittance could not be recorded. Please try again.' }, { status: 500 });
  }
}
