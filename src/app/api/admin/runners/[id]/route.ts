import { NextResponse } from 'next/server';
import { asRunnerCommunity } from '@/lib/running-community';
import {
  optionalUpperCaseForStorage,
  upperCaseForStorage,
} from '@/lib/text-case';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import {
  SENSITIVE_RUNNER_FIELDS,
  changedFields,
  listFields,
  recordAudit,
} from '@/lib/audit';
import { runnerRef } from '@/lib/order-ref';

/**
 * Editing and removing one runner on an order.
 *
 * **Removal is soft.** It used to be a hard DELETE, which is half a trail: an
 * audit row saying a runner was deleted, with nothing left to look at. The row
 * now keeps its data and gains `deletedAt` / `deletedById`, and every read a
 * person sees filters it out — see Runner.deletedAt in the schema.
 */

/** The columns an organizer can edit, in the order the trail lists them. */
const EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'gender',
  'birthdate',
  'singletSize',
  'emergencyContactName',
  'emergencyContactPhone',
  'medicalConditions',
  'runningCommunity',
] as const;

/** The runner, its order and how many live runners that order holds. */
async function findLiveRunner(id: string) {
  return db.runner.findFirst({
    where: { id, deletedAt: null },
    include: {
      registration: {
        select: {
          orderRef: true,
          eventId: true,
          event: { select: { organizerId: true } },
          _count: { select: { runners: { where: { deletedAt: null } } } },
        },
      },
    },
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify the actor may edit runners on the event this one belongs to
    const runner = await findLiveRunner(id);

    if (!runner) {
      return NextResponse.json({ error: 'Runner not found' }, { status: 404 });
    }

    const reach = {
      organizerId: runner.registration.event.organizerId,
      eventId: runner.registration.eventId,
    };
    if (!can(actor, 'registration:edit', reach)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      birthdate,
      singletSize,
      emergencyContactName,
      emergencyContactPhone,
      medicalConditions,
      runningCommunity
    } = body;

    const data = {
      // Registrant text is stored uppercase, exactly as the wizards store it
      // (lib/text-case.ts) — an organizer fixing a typo must not be the one
      // row in the export that reads differently. Email is left alone: its
      // local part is case-sensitive on some mail servers.
      firstName: upperCaseForStorage(firstName),
      lastName: upperCaseForStorage(lastName),
      email,
      phone,
      gender: upperCaseForStorage(gender),
      birthdate,
      singletSize,
      emergencyContactName: upperCaseForStorage(emergencyContactName),
      emergencyContactPhone,
      medicalConditions: optionalUpperCaseForStorage(medicalConditions),
      // Blank clears back to the default rather than storing an empty
      // string, so a club tally still adds up to the head count.
      runningCommunity: asRunnerCommunity(runningCommunity)
    };

    const updatedRunner = await db.$transaction(async tx => {
      const updated = await tx.runner.update({
        where: { id },
        data,
        include: {
          category: true // To match the return type expected by UI
        }
      });

      // Birthdate, emergency contact and medical notes are recorded as having
      // changed, never with their values — the trail must not become a second
      // copy of the registrants table.
      const changes = changedFields(runner, updated, EDITABLE_FIELDS, SENSITIVE_RUNNER_FIELDS);
      if (Object.keys(changes).length > 0) {
        const ref = runnerRef(
          runner.registration.orderRef,
          runner.runnerNo,
          runner.registration._count.runners,
        );
        await recordAudit(tx, actor, {
          action: 'runner.updated',
          entityType: 'Runner',
          entityId: id,
          eventId: runner.registration.eventId,
          organizerId: runner.registration.event.organizerId,
          summary: `Edited runner ${updated.firstName} ${updated.lastName} (${ref}): ${listFields(Object.keys(changes))}.`,
          changes,
        });
      }

      return updated;
    });

    return NextResponse.json(updatedRunner);
  } catch (error: any) {
    console.error('Update runner error:', error);
    return NextResponse.json({ error: 'Failed to update runner', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const runner = await findLiveRunner(id);

    if (!runner) {
      return NextResponse.json({ error: 'Runner not found' }, { status: 404 });
    }

    const reach = {
      organizerId: runner.registration.event.organizerId,
      eventId: runner.registration.eventId,
    };
    if (!can(actor, 'registration:delete', reach)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ref = runnerRef(
      runner.registration.orderRef,
      runner.runnerNo,
      runner.registration._count.runners,
    );

    await db.$transaction(async tx => {
      await tx.runner.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: actor.id },
      });
      await recordAudit(tx, actor, {
        action: 'runner.deleted',
        entityType: 'Runner',
        entityId: id,
        eventId: runner.registration.eventId,
        organizerId: runner.registration.event.organizerId,
        summary: `Deleted runner ${runner.firstName} ${runner.lastName} (${ref}) from order ${runner.registration.orderRef}.`,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete runner error:', error);
    return NextResponse.json({ error: 'Failed to delete runner', details: error.message }, { status: 500 });
  }
}
