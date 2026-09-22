import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { AuditChanges, recordAudit } from '@/lib/audit';
import { PACER_DISCOUNT_TYPE, isPacerRegistered, pacerNameFromInput } from '@/lib/pacer';
import { PACER_SELECT } from '@/lib/pacer-store';

/**
 * Changing or removing one pacer.
 *
 * Four things a PATCH may carry, each independent and each audited:
 *
 *  - **`assigneeName`** — a rename. The code itself never changes: a pacer
 *    already holding it would otherwise find it dead, and the point of a
 *    rename is usually that the wrong name was typed, not that a different
 *    person is running.
 *  - **`paused`** — the hold, exactly as it is on a promotion. It is what staff
 *    reach for instead of deleting a code somebody may already be holding.
 *  - **`codeSent`** — *Mark as sent* and *Mark as not sent*. The app emails no
 *    pacer, so this is the only evidence the dashboard has that somebody was
 *    actually told, which is why it is a deliberate mark and not something
 *    copying the code sets for you.
 *  - **`waiveAdminFee`** — Run As One's own commission. **`promo:waive-fee`,
 *    the Super Admin alone**; anyone else is answered 403 with the field, so
 *    the screen can point at the control rather than showing a bare error.
 *
 * The category is deliberately **not** editable. It is what the code is locked
 * to, it is in the code's own text, and it is the slot the organizer set aside;
 * moving it would silently move a held place from one race distance to another.
 * Deleting this pacer and adding the right one is the honest way.
 *
 * Auth-checked and scoped to the actor's own organizer's event, like every
 * other admin route.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; pacerId: string }> },
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, pacerId } = await params;
    const found = await findPacer(actor.orgId, id, pacerId);
    if (!found || !can(actor, 'promo:manage', { organizerId: actor.orgId, eventId: id })) {
      return NextResponse.json({ error: 'Pacer not found.' }, { status: 404 });
    }
    const { pacer, eventTitle } = found;

    const body = await request.json();
    const data: {
      assigneeName?: string;
      paused?: boolean;
      codeSentAt?: Date | null;
      waiveAdminFee?: boolean;
    } = {};
    const changes: AuditChanges = {};
    const summaries: string[] = [];

    if (body?.assigneeName !== undefined) {
      const name = pacerNameFromInput(body.assigneeName);
      if ('problem' in name) {
        return NextResponse.json(name.problem, { status: 400 });
      }
      if (name.name !== pacer.assigneeName) {
        data.assigneeName = name.name;
        changes.assigneeName = [pacer.assigneeName, name.name];
        summaries.push(`renamed to ${name.name}`);
      }
    }

    if (typeof body?.paused === 'boolean' && body.paused !== pacer.paused) {
      data.paused = body.paused;
      changes.paused = [pacer.paused, body.paused];
      summaries.push(body.paused ? 'paused' : 'resumed');
    }

    if (typeof body?.codeSent === 'boolean') {
      const wasSent = pacer.codeSentAt !== null;
      if (body.codeSent !== wasSent) {
        // The timestamp is taken here, not from the request: "when was this
        // sent" is a fact about the moment somebody said so, and a client that
        // could name it could name yesterday.
        data.codeSentAt = body.codeSent ? new Date() : null;
        changes.codeSentAt = [wasSent, body.codeSent];
        summaries.push(body.codeSent ? 'marked as sent' : 'marked as not sent');
      }
    }

    // Asked before anything is written, because this is the one field on the
    // form that is not the organizer's to set. An admin who ticks it is told
    // so rather than having it quietly dropped — a pacer who was promised a
    // free entry and then charged the fee is the failure this refusal prevents.
    let waived = false;
    if (typeof body?.waiveAdminFee === 'boolean' && body.waiveAdminFee !== pacer.waiveAdminFee) {
      if (!can(actor, 'promo:waive-fee', { organizerId: actor.orgId, eventId: id })) {
        return NextResponse.json(
          { error: 'Only the Super Admin can waive the admin fee.', field: 'waiveAdminFee' },
          { status: 403 },
        );
      }
      data.waiveAdminFee = body.waiveAdminFee;
      changes.waiveAdminFee = [pacer.waiveAdminFee, body.waiveAdminFee];
      summaries.push(body.waiveAdminFee ? 'admin fee waived' : 'admin fee reinstated');
      waived = body.waiveAdminFee;
    }

    if (Object.keys(data).length === 0) {
      // Nothing to do, and deliberately not an error: a double-tap on *Mark as
      // sent* should leave the row as it is rather than writing a second trail
      // entry saying nothing changed.
      return NextResponse.json({ pacer });
    }

    // **The name as it was**, for the entry that describes the change. A rename
    // summarised under its own new name reads as a circle ("Pacer MARIA SANTOS:
    // renamed to MARIA SANTOS"), which tells a reader nothing about what
    // actually happened; the `changes` blob carries both halves either way.
    const priorName = pacer.assigneeName ?? pacer.code;
    // The name as it is now, for the waiver entry, which is not describing a
    // change to the name but identifying the person the money was given to.
    const currentName = data.assigneeName ?? pacer.assigneeName ?? pacer.code;

    const updated = await prisma.$transaction(async tx => {
      const row = await tx.promoCode.update({
        where: { id: pacer.id },
        data,
        select: PACER_SELECT,
      });

      await recordAudit(tx, actor, {
        action: 'pacer.updated',
        entityType: 'PromoCode',
        entityId: pacer.id,
        eventId: id,
        summary: `Pacer ${priorName} on ${eventTitle}: ${summaries.join(', ')}.`,
        changes,
      });

      // Its own verb when the waiver goes on, for the same reason the create
      // route writes one: this is Run As One giving away its own commission,
      // and it should be findable by filtering the trail rather than by opening
      // every "Changed a pacer" row.
      if (waived) {
        await recordAudit(tx, actor, {
          action: 'pacer.fee_waived',
          entityType: 'PromoCode',
          entityId: pacer.id,
          eventId: id,
          summary: `Waived Run As One's admin fee for pacer ${currentName} on ${eventTitle}.`,
          changes: { waiveAdminFee: [false, true] },
        });
      }

      return row;
    });

    return NextResponse.json({ pacer: updated });
  } catch (error: any) {
    console.error('Pacer Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Removing a pacer — **only while their code is unclaimed**.
 *
 * Once a pacer has registered, the code is the thing their order was placed
 * with. Deleting it would not undo the registration (`Registration.promoCode`
 * is a snapshot, so the receipt survives) but it would leave a runner in the
 * race whose free entry nothing on the screen can account for, and the pacer
 * would still be holding a category slot nobody could explain. Pausing is the
 * answer there, and the refusal says so.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; pacerId: string }> },
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, pacerId } = await params;
    const found = await findPacer(actor.orgId, id, pacerId);
    if (!found || !can(actor, 'promo:manage', { organizerId: actor.orgId, eventId: id })) {
      return NextResponse.json({ error: 'Pacer not found.' }, { status: 404 });
    }
    const { pacer, eventTitle } = found;

    if (isPacerRegistered(pacer)) {
      return NextResponse.json(
        {
          error:
            'This pacer has already registered with their code, so it cannot be removed. Pause it instead.',
        },
        { status: 409 },
      );
    }

    const name = pacer.assigneeName ?? pacer.code;

    await prisma.$transaction(async tx => {
      // The `PromoCategory` row goes with it: the relation cascades on delete,
      // so the one category this code was locked to needs no second statement.
      await tx.promoCode.delete({ where: { id: pacer.id } });
      await recordAudit(tx, actor, {
        action: 'pacer.deleted',
        entityType: 'PromoCode',
        entityId: pacer.id,
        eventId: id,
        summary: `Removed pacer ${name} from ${eventTitle}.`,
        changes: { code: pacer.code, waiveAdminFee: pacer.waiveAdminFee },
      });
    });

    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error('Pacer Delete Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * This pacer, if it is one of this organizer's, on this event, and actually a
 * pacer code.
 *
 * All four conditions in the `where`, not checked afterwards: `discountType`
 * belongs there as much as `organizerId` does, or this route would be a second
 * way to pause and delete ordinary promotions — one that skips everything the
 * marketing route does about voucher batches.
 */
async function findPacer(organizerId: string, eventId: string, pacerId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId },
    select: { id: true, title: true },
  });
  if (!event) return null;

  const pacer = await prisma.promoCode.findFirst({
    where: {
      id: pacerId,
      organizerId,
      eventId,
      discountType: PACER_DISCOUNT_TYPE,
    },
    select: PACER_SELECT,
  });
  if (!pacer) return null;

  return { pacer, eventTitle: event.title };
}
