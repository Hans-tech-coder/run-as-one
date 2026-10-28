import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { changedFields, recordAudit } from '@/lib/audit';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { addOnFromInput, stockBelowSoldProblem } from '@/lib/add-ons';
import { ADD_ON_ORDER, ADD_ON_SELECT, addOnHasSales, takenAddOnStock } from '@/lib/add-on-stock';

/**
 * One add-on: edit it, switch it on or off, move it, or delete it.
 *
 * Same reach as the list route beside it — `event:edit`, scoped to the
 * actor's organizer — and the item must belong to the event in the URL, so an
 * add-on id from another race is a 404 rather than an edit there.
 *
 * PATCH takes one of three bodies, by what it carries:
 *  - `{ active }` alone: the panel's on/off switch;
 *  - `{ move: 'up' | 'down' }`: the panel's reorder, renumbering the whole
 *    list in one transaction so two items can never be left sharing a place;
 *  - the full form: an edit, checked by `addOnFromInput` like a new item.
 *
 * Editing never touches a past purchase: every `RunnerAddOn` holds its own
 * name, price, option and seller (D1). What an edit may not do is set the
 * stock under what live orders already hold.
 */

type Params = { params: Promise<{ id: string; addOnId: string }> };

async function editableAddOn(id: string, addOnId: string) {
  const actor = await getActor();
  if (!actor) return { refusal: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;

  const event = await prisma.event.findFirst({
    where: { id, organizerId: actor.orgId },
    select: {
      id: true,
      title: true,
      categories: { orderBy: CATEGORY_ORDER, select: { id: true, name: true } },
    },
  });
  if (!event || !can(actor, 'event:edit', { organizerId: actor.orgId, eventId: id })) {
    return { refusal: NextResponse.json({ error: 'Event not found.' }, { status: 404 }) } as const;
  }
  const addOn = await prisma.eventAddOn.findFirst({ where: { id: addOnId, eventId: id }, select: ADD_ON_SELECT });
  if (!addOn) {
    return { refusal: NextResponse.json({ error: 'That add-on is no longer on this event.' }, { status: 404 }) } as const;
  }
  return { actor, event, addOn } as const;
}

const EDITED_FIELDS = [
  'name',
  'description',
  'price',
  'imageUrls',
  'optionKind',
  'options',
  'maxPerRunner',
  'stockLimit',
  'salesCloseAt',
  'categoryIds',
  'soldBy',
  'active',
] as const;

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, addOnId } = await params;
    const found = await editableAddOn(id, addOnId);
    if ('refusal' in found) return found.refusal;
    const { actor, event, addOn } = found;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'The add-on could not be read. Please try again.' }, { status: 400 });
    }
    const keys = Object.keys(body);

    if (keys.length === 1 && keys[0] === 'active') {
      if (typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'Say whether the add-on is on or off.' }, { status: 400 });
      }
      const row = await prisma.$transaction(async tx => {
        const updated = await tx.eventAddOn.update({ where: { id: addOnId }, data: { active: body.active }, select: ADD_ON_SELECT });
        await recordAudit(tx, actor, {
          action: 'add_on.toggled',
          entityType: 'EventAddOn',
          entityId: addOnId,
          eventId: id,
          summary: `${body.active ? 'Switched on' : 'Switched off'} the add-on ${addOn.name} on ${event.title}.`,
          changes: { active: [addOn.active, body.active] },
        });
        return updated;
      });
      return NextResponse.json({ addOn: row });
    }

    if (keys.length === 1 && keys[0] === 'move') {
      if (body.move !== 'up' && body.move !== 'down') {
        return NextResponse.json({ error: 'Say which way to move the add-on.' }, { status: 400 });
      }
      await prisma.$transaction(async tx => {
        const order = await tx.eventAddOn.findMany({ where: { eventId: id }, orderBy: ADD_ON_ORDER, select: { id: true, sortOrder: true } });
        const from = order.findIndex(row => row.id === addOnId);
        const to = body.move === 'up' ? from - 1 : from + 1;
        if (from < 0 || to < 0 || to >= order.length) return;
        [order[from], order[to]] = [order[to], order[from]];
        // Renumbered whole: items saved before ordering existed all share 0,
        // and swapping two equal numbers would move nothing.
        for (const [index, row] of order.entries()) {
          if (row.sortOrder !== index) {
            await tx.eventAddOn.update({ where: { id: row.id }, data: { sortOrder: index } });
          }
        }
        await recordAudit(tx, actor, {
          action: 'add_on.updated',
          entityType: 'EventAddOn',
          entityId: addOnId,
          eventId: id,
          summary: `Moved the add-on ${addOn.name} ${body.move} the list on ${event.title}.`,
          changes: { position: [from + 1, to + 1] },
        });
      });
      return NextResponse.json({ ok: true });
    }

    const input = addOnFromInput(
      // `active` is the switch's to change, not the form's: an edit sent
      // without it must not switch a sold-out item back on.
      { ...body, active: typeof body.active === 'boolean' ? body.active : addOn.active },
      { eventCategoryIds: event.categories.map(category => category.id) },
    );
    if ('problem' in input) return NextResponse.json(input.problem, { status: 400 });

    const row = await prisma.$transaction(async tx => {
      if (input.data.stockLimit !== null) {
        const taken = (await takenAddOnStock([addOnId], tx)).get(addOnId) ?? 0;
        const problem = stockBelowSoldProblem(input.data.stockLimit, taken);
        if (problem) return { problem };
      }
      const updated = await tx.eventAddOn.update({ where: { id: addOnId }, data: input.data, select: ADD_ON_SELECT });
      const changes = changedFields(addOn, updated, EDITED_FIELDS);
      if (Object.keys(changes).length > 0) {
        await recordAudit(tx, actor, {
          action: 'add_on.updated',
          entityType: 'EventAddOn',
          entityId: addOnId,
          eventId: id,
          summary: `Edited the add-on ${updated.name} on ${event.title}.`,
          changes,
        });
      }
      return { updated };
    });
    if ('problem' in row) return NextResponse.json(row.problem, { status: 409 });

    return NextResponse.json({ addOn: row.updated });
  } catch (error) {
    console.error('Add-on Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Deletes an item **nobody has bought**. One any order ever named — even a
 * cancelled one — can only be switched off: its lines would survive the
 * delete (they are snapshots, and the link is SetNull), but the item behind a
 * receipt is what staff come looking for when a runner asks about it.
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, addOnId } = await params;
    const found = await editableAddOn(id, addOnId);
    if ('refusal' in found) return found.refusal;
    const { actor, event, addOn } = found;

    const refused = await prisma.$transaction(async tx => {
      if (await addOnHasSales(addOnId, tx)) return true;
      await tx.eventAddOn.delete({ where: { id: addOnId } });
      await recordAudit(tx, actor, {
        action: 'add_on.deleted',
        entityType: 'EventAddOn',
        entityId: addOnId,
        eventId: id,
        summary: `Deleted the add-on ${addOn.name} from ${event.title}.`,
        changes: { name: addOn.name, price: addOn.price },
      });
      return false;
    });
    if (refused) {
      return NextResponse.json(
        { error: `${addOn.name} has already been bought, so it cannot be deleted. Switch it off to stop selling it.` },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Add-on Delete Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
