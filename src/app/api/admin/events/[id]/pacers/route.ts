import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { PACER_DISCOUNT_TYPE, pacerCodeFor, pacerFromInput } from '@/lib/pacer';
import { PACER_SELECT, pacersForEvent } from '@/lib/pacer-store';

/**
 * One event's pacers: the list, and adding one.
 *
 * A pacer code is a `PromoCode` whose kind is `PACER` — a free entry for one
 * named person in one category of this race. What it *is* is written down in
 * `src/lib/pacer.ts`, which this route shares with the screen, so a refusal the
 * form predicts and a refusal the server gives are the same sentence.
 *
 * **Managing pacers is `promo:manage`** (OWNER and ADMIN), the same verb that
 * guards promotions, because both are the organizer giving away its own
 * entries. **Waiving Run As One's admin fee is `promo:waive-fee`** (OWNER
 * alone), because that one is not the organizer's money to give — and it is
 * checked here rather than trusted from the form, which could simply post
 * `true`.
 *
 * Every write is scoped to the actor's own organizer's event: an id in the URL
 * is not proof the race belongs to the browser's owner, and without the
 * `organizerId` any signed-in admin handed another's event id could mint free
 * entries in their race.
 */

/**
 * How many codes to try before giving up.
 *
 * `pacerCodeFor` has ~531,000 tails per category against a handful of pacers
 * per race, so a collision is a curiosity rather than a risk — but the
 * `[organizerId, code]` index is what actually guarantees uniqueness, and a
 * route that assumed the odds would fail with a 500 on the day it lost. Five
 * attempts, then an honest answer.
 */
const CODE_ATTEMPTS = 5;

/**
 * This event's pacers.
 *
 * The screen itself is server-rendered and re-reads through `router.refresh()`
 * like every other dashboard table, so this is here for a caller that wants the
 * list without rendering a page. It is the same scope and the same permission
 * as the write below, deliberately: a read that was easier to reach than the
 * write it accompanies is a read somebody will find first.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const event = await prisma.event.findFirst({
      where: { id, organizerId: actor.orgId },
      select: { id: true },
    });
    if (!event || !can(actor, 'promo:manage', { organizerId: actor.orgId, eventId: id })) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const pacers = await pacersForEvent(actor.orgId, id);

    return NextResponse.json({ pacers });
  } catch (error: any) {
    console.error('Pacer List Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const event = await prisma.event.findFirst({
      where: { id, organizerId: actor.orgId },
      select: {
        id: true,
        title: true,
        // `distance` as well as `name`: the generated code carries the
        // distance (`PACER-21KM-7KQ4`), falling back to the name.
        categories: {
          orderBy: CATEGORY_ORDER,
          select: { id: true, name: true, distance: true },
        },
      },
    });
    if (!event || !can(actor, 'promo:manage', { organizerId: actor.orgId, eventId: id })) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const body = await request.json();
    const input = pacerFromInput(body, {
      eventCategoryIds: event.categories.map(category => category.id),
      // The Super Admin alone. Asked of the matrix rather than of the role
      // string, so the day the owner decides otherwise it is one edit in
      // permissions.ts and no edit here.
      canWaiveAdminFee: can(actor, 'promo:waive-fee', { organizerId: actor.orgId, eventId: id }),
    });
    if ('problem' in input) {
      // 403 rather than 400 when the refusal is about reach: the form was not
      // malformed, the person simply may not do this. The field travels either
      // way, so the screen can light the control that caused it.
      const status = input.problem.field === 'waiveAdminFee' ? 403 : 400;
      return NextResponse.json(input.problem, { status });
    }

    const category = event.categories.find(row => row.id === input.data.categoryId)!;

    const created = await withFreshCode(async code => {
      return prisma.$transaction(async tx => {
        const row = await tx.promoCode.create({
          data: {
            code,
            discountType: PACER_DISCOUNT_TYPE,
            // Unused by this kind: the discount is always the whole entry line.
            discountValue: 0,
            // Single-use, like a voucher and for the same reason — one pacer,
            // one entry. There is no separate flag for it anywhere in this
            // schema, so this is what makes it so.
            usageLimit: 1,
            // Never automatic: the pacer types the code, which is how they end
            // up giving consent, the waiver and an emergency contact like every
            // other runner.
            automatic: false,
            eventId: event.id,
            organizerId: actor.orgId,
            assigneeName: input.data.assigneeName,
            waiveAdminFee: input.data.waiveAdminFee,
            // **Exactly one category**, written in the same statement as the
            // code: a pacer code with no category would be a free entry to
            // whichever distance the pacer chose, which is not what was agreed
            // with them and not the slot the organizer set aside.
            categories: { create: [{ categoryId: input.data.categoryId }] },
          },
          select: PACER_SELECT,
        });

        await recordAudit(tx, actor, {
          action: 'pacer.created',
          entityType: 'PromoCode',
          entityId: row.id,
          eventId: event.id,
          summary: `Added pacer ${input.data.assigneeName} on the ${category.name} of ${event.title}.`,
          changes: {
            code: row.code,
            category: category.name,
            waiveAdminFee: input.data.waiveAdminFee,
          },
        });

        // A second entry, on its own verb, when the fee was waived at creation.
        // Run As One giving away its own commission is a decision somebody
        // should be able to find by filtering the trail, not by opening every
        // "Added a pacer" row to see what was inside it.
        if (input.data.waiveAdminFee) {
          await recordAudit(tx, actor, {
            action: 'pacer.fee_waived',
            entityType: 'PromoCode',
            entityId: row.id,
            eventId: event.id,
            summary: `Waived Run As One's admin fee for pacer ${input.data.assigneeName} on ${event.title}.`,
            changes: { waiveAdminFee: [false, true] },
          });
        }

        return row;
      });
    }, () => pacerCodeFor(category));

    if (!created) {
      return NextResponse.json(
        {
          error: 'Could not generate a code for this pacer. Please try again.',
          field: 'assigneeName',
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ pacer: created });
  } catch (error: any) {
    console.error('Pacer Creation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Runs `write` with a freshly generated code, retrying when the database says
 * that code is already taken.
 *
 * The uniqueness check is the index (`P2002` on `[organizerId, code]`) rather
 * than a `findFirst` before the insert, because a check before a write is a
 * check two simultaneous requests both pass — the same reason `redeemPromoCode`
 * locks instead of counting first.
 */
async function withFreshCode<T>(
  write: (code: string) => Promise<T>,
  nextCode: () => string,
): Promise<T | null> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    try {
      return await write(nextCode());
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
    }
  }
  return null;
}
