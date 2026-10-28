import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { addOnFromInput } from '@/lib/add-ons';
import { formatPesos } from '@/lib/money';
import { ADD_ON_SELECT, addOnsForEvent } from '@/lib/add-on-stock';

/**
 * One event's add-ons (ADD_ONS_PLAN.md Batch 1): the list, and adding one.
 *
 * **Behind `event:edit`**, the verb that guards the rest of Event edit, since
 * an add-on is part of what the event sells — its price lands on a runner's
 * checkout exactly as a category's does. Scoped to the actor's own organizer:
 * an id in the URL is not proof the race is theirs. A refusal of reach is the
 * same 404 as a missing event, so an id cannot be probed for.
 *
 * What a valid item is lives in `src/lib/add-ons.ts`, shared with the panel,
 * so the box the form lights is the box the server names.
 */

async function editableEvent(id: string) {
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
  return { actor, event } as const;
}

/**
 * The items with what each has sold, and the event's categories for the
 * form's "Who can buy it" list — the saved ones, since an item can only be
 * scoped to a category that exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const found = await editableEvent(id);
    if ('refusal' in found) return found.refusal;

    return NextResponse.json({ addOns: await addOnsForEvent(id), categories: found.event.categories });
  } catch (error) {
    console.error('Add-on List Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const found = await editableEvent(id);
    if ('refusal' in found) return found.refusal;
    const { actor, event } = found;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'The add-on could not be read. Please try again.' }, { status: 400 });
    }
    const input = addOnFromInput(body, { eventCategoryIds: event.categories.map(category => category.id) });
    if ('problem' in input) return NextResponse.json(input.problem, { status: 400 });

    const created = await prisma.$transaction(async tx => {
      // Last in the list: a new item joins the end rather than jumping ahead
      // of the ones staff already ordered.
      const last = await tx.eventAddOn.aggregate({ where: { eventId: id }, _max: { sortOrder: true } });
      const row = await tx.eventAddOn.create({
        data: { ...input.data, eventId: id, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        select: ADD_ON_SELECT,
      });
      await recordAudit(tx, actor, {
        action: 'add_on.created',
        entityType: 'EventAddOn',
        entityId: row.id,
        eventId: id,
        summary: `Added the add-on ${row.name} (₱${formatPesos(row.price)}) to ${event.title}.`,
        changes: {
          name: row.name,
          price: row.price,
          optionKind: row.optionKind,
          // The trail keeps scalars, so lists are written as the words staff
          // would read: the options, and the categories by name.
          options: row.options.join(', ') || null,
          maxPerRunner: row.maxPerRunner,
          stockLimit: row.stockLimit,
          salesCloseAt: row.salesCloseAt?.toISOString() ?? null,
          categories:
            event.categories
              .filter(category => row.categoryIds.includes(category.id))
              .map(category => category.name)
              .join(', ') || 'Every category',
          soldBy: row.soldBy,
          active: row.active,
        },
      });
      return row;
    });

    return NextResponse.json({ addOn: { ...created, sold: 0, hasSales: false } });
  } catch (error) {
    console.error('Add-on Creation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
