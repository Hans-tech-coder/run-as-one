import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { takenSlotsByCategory } from '@/lib/registration-gate';
import { eventPromotions } from '@/lib/promo-store';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { updateEvent } from './update-event';
import { updateRegistrationControls } from './registration-controls';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Scoped to the actor's own organizer's events. This is what the edit
    // form reads, and it carries the event's bank accounts — an id from the
    // browser is not proof it belongs to the browser's owner, so the scope has
    // to be in the query rather than assumed from the link that was followed.
    // A STAFF member unassigned to this race is told the same "not found".
    const event = await db.event.findFirst({
      where: { id, organizerId: actor.orgId },
      include: {
        categories: { orderBy: CATEGORY_ORDER },
        bankAccounts: { orderBy: { sortOrder: 'asc' } },
        // Only the count: the edit form locks the distances-or-packages choice
        // once anyone has registered, because switching it changes what those
        // runners already bought.
        _count: { select: { registrations: true } },
      }
    });

    if (!event || !can(actor, 'event:view', { organizerId: actor.orgId, eventId: id })) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // How full each option already is, sent alongside it. An organizer typing
    // a slot limit needs to know they are capping at 100 an option that 120
    // runners are already in — the form says so under the field rather than
    // letting them find out from the public page.
    const taken = await takenSlotsByCategory(event.categories.map((c) => c.id));

    // What promotions are running on this race, read-only. An organizer
    // editing an event had no way of knowing a 20% code was live on it
    // without leaving for the marketing screen and reading the Applies To
    // column of every row. Scoped by `eventPromotions` to this organizer's
    // own promotions that reach this event — the same scope checkout uses, so
    // the panel cannot promise something a runner could not be given.
    const promotions = await eventPromotions(event);

    return NextResponse.json({
      ...event,
      categories: event.categories.map((category) => ({
        ...category,
        slotsTaken: taken.get(category.id) ?? 0,
      })),
      promotions,
    });
  } catch (error) {
    console.error('Fetch event error:', error);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}


/** The Edit Event save — see update-event.ts. */
export const PUT = updateEvent;

/** The events table's in-place sign-up controls — see registration-controls.ts. */
export const PATCH = updateRegistrationControls;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const existingEvent = await db.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true, title: true, date: true },
    });

    // Deleting a race is the owner's alone (lib/permissions.ts). Anyone else is
    // told it does not exist, so a probe cannot tell the two apart; the events
    // table offers Delete only to those who may.
    if (
      !existingEvent ||
      !can(actor, 'event:delete', { organizerId: existingEvent.organizerId, eventId: id })
    ) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // A race Run As One has already paid out on is part of the company's
    // books (ADMIN_MERGE_PLAN.md, Batch 6), and its remittances are never
    // deleted — voided ones included — so the race cannot go either. Asked
    // here rather than left to the foreign key, so the modal names the reason.
    const remittances = await db.remittance.count({ where: { eventId: id } });
    if (remittances > 0) {
      return NextResponse.json(
        {
          error: `${existingEvent.title} has ${remittances} recorded ${
            remittances === 1 ? 'remittance' : 'remittances'
          } to its organizer, so it cannot be deleted.`,
        },
        { status: 409 },
      );
    }

    // Nothing cascades: every foreign key pointing at an event is ON DELETE
    // RESTRICT, so the dependent rows have to be removed children-first or
    // Postgres rejects the delete outright. Order matters — a runner points at
    // both a registration and a category, and a race result at both an event
    // and a category, so those go before the categories they reference.
    // (Staff assignments are the one exception and cascade with the event.)
    //
    // The trail row survives the event — AuditLog has no foreign keys — and
    // says how much went with it, since after this nothing else can.
    await db.$transaction(async (prisma) => {
      // A category change points at a runner, its order and two categories,
      // so it goes before all of them (CATEGORY_CHANGE_PLAN.md).
      await prisma.categoryChange.deleteMany({ where: { eventId: id } });
      // A delivery switch points at its orders, and its links at both, so
      // links, then switches, before the registrations (LOGISTICS_CHANGE_PLAN.md).
      await prisma.logisticsChangeOrder.deleteMany({ where: { change: { eventId: id } } });
      await prisma.logisticsChange.deleteMany({ where: { eventId: id } });
      const runners = await prisma.runner.deleteMany({ where: { registration: { eventId: id } } });
      const registrations = await prisma.registration.deleteMany({ where: { eventId: id } });
      const results = await prisma.raceResult.deleteMany({ where: { eventId: id } });
      await prisma.category.deleteMany({ where: { eventId: id } });
      await prisma.bankAccount.deleteMany({ where: { eventId: id } });
      await prisma.event.delete({ where: { id } });

      await recordAudit(prisma, actor, {
        action: 'event.deleted',
        entityType: 'Event',
        entityId: id,
        eventId: id,
        organizerId: existingEvent.organizerId,
        summary: `Deleted event ${existingEvent.title} (${existingEvent.date}) with ${registrations.count} registrations, ${runners.count} runners and ${results.count} results.`,
        changes: {
          registrations: registrations.count,
          runners: runners.count,
          results: results.count,
        },
      });
    });

    return NextResponse.json({ message: 'Event deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error('Delete event error:', error);
    // The message travels to the confirmation modal, so a failure names what
    // actually went wrong instead of a blank "something happened".
    return NextResponse.json({ error: error.message || 'Failed to delete event' }, { status: 500 });
  }
}
