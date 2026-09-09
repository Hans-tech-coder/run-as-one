import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { MAX_PROMO_CODE_LENGTH, normalizePromoCode } from '@/lib/discount';
import { promoTermsFromInput } from '@/lib/promo-input';

/**
 * Editing and deleting a promotion.
 *
 * **A batch is one promotion, not two hundred.** The marketing table already
 * presents a bulk-generated batch as a single row, because that is how an
 * organizer thinks about it, and an edit that changed one voucher out of two
 * hundred would leave a promotion quietly disagreeing with itself. So an
 * operation on any member of a batch is an operation on the whole batch, and
 * the response says how many rows it touched.
 *
 * **Deleting is safe for history.** `Registration.promoCode` and
 * `discountAmount` are snapshots taken at checkout precisely so that a
 * promotion can be removed without rewriting anyone's receipt. What deletion
 * takes away is the ability to redeem it again, not the record that it was.
 *
 * **Pausing is its own request.** A body carrying only `{ paused }` toggles
 * the switch and touches nothing else, the same way
 * `PATCH /api/admin/events/[id]` is the registration hold on its own: the row
 * menu has no form open, so it has no terms to re-post, and making it send
 * some would be inventing values it never rendered.
 *
 * Auth-checked and scoped to the signed-in organizer's own promotions, like
 * every other admin route: an id from the browser is not proof it belongs to
 * the browser's owner.
 */

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.promoCode.findFirst({
      where: { id, organizerId: auth.id },
      select: { id: true, code: true, batchLabel: true, automatic: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 });
    }

    const body = await request.json();

    // The hold on its own. Checked before the terms are read, because a body
    // that carries only this has no terms in it to validate and must not be
    // refused for the discount type it never claimed to be setting.
    if (typeof body?.paused === 'boolean' && Object.keys(body).length === 1) {
      const held = await prisma.promoCode.updateMany({
        where: batchWhere(existing, auth.id),
        data: { paused: body.paused },
      });
      return NextResponse.json({ updated: held.count, paused: body.paused });
    }
    const terms = await promoTermsFromInput(
      // `automatic` is not editable. Turning a code into a codeless promotion,
      // or the reverse, changes what the row *is* — every runner holding the
      // code would find it gone, or a promotion nobody was told about would
      // suddenly need telling. Creating the other one is the honest way.
      { ...body, automatic: existing.automatic },
      auth.id,
    );
    if ('problem' in terms) {
      return NextResponse.json(terms.problem, { status: 400 });
    }

    // A batch's codes are random and per-row; only its shared terms are the
    // organizer's to edit. A single promotion may be renamed.
    let code: string | undefined;
    if (!existing.batchLabel) {
      const cleaned = normalizePromoCode(body.code);
      if (!cleaned) {
        return NextResponse.json(
          {
            error: existing.automatic
              ? 'Name this promotion. Runners see the name on the event page and on their receipt.'
              : 'Enter the code runners will type at checkout.',
            field: 'code',
          },
          { status: 400 }
        );
      }
      if (cleaned.length > MAX_PROMO_CODE_LENGTH) {
        return NextResponse.json(
          { error: `A code can be at most ${MAX_PROMO_CODE_LENGTH} characters.`, field: 'code' },
          { status: 400 }
        );
      }
      if (cleaned !== existing.code) {
        const clash = await prisma.promoCode.findFirst({
          where: { organizerId: auth.id, code: cleaned },
          select: { id: true },
        });
        if (clash) {
          return NextResponse.json(
            {
              error: existing.automatic
                ? `You already have a promotion called ${cleaned}.`
                : `You already have a code called ${cleaned}.`,
              field: 'code',
            },
            { status: 400 }
          );
        }
      }
      code = cleaned;
    }

    // The terms and the price list move together or not at all. A promotion
    // whose columns saved and whose prices did not is one the event page would
    // advertise at numbers the checkout no longer holds, which is the exact
    // disagreement this feature exists to prevent.
    const updated = await prisma.$transaction(async tx => {
      const rows = await tx.promoCode.updateMany({
        where: batchWhere(existing, auth.id),
        data: {
          ...terms.data,
          ...(code ? { code } : {}),
          // A voucher is single-use by definition, so a batch's limit is not
          // the organizer's to raise — doing so would turn the promotion into
          // something other than the vouchers they handed out.
          ...(existing.batchLabel ? { usageLimit: 1 } : {}),
        },
      });

      // The price rows are **updated in place, never replaced**. Each carries
      // `usageCount` — how many runners have already taken that price — and
      // deleting the row to write a new one would reset that to zero, which
      // would let a capped early bird be sold all over again. Only the
      // categories the organizer actually cleared are removed.
      //
      // A batch never reaches here with prices, since CATEGORY_PRICE is
      // automatic-only, so these are always the one promotion's own rows.
      const keep = terms.categoryPrices.map(entry => entry.categoryId);
      await tx.promoCategoryPrice.deleteMany({
        where: { promoCodeId: existing.id, categoryId: { notIn: keep } },
      });

      for (const entry of terms.categoryPrices) {
        await tx.promoCategoryPrice.upsert({
          where: {
            promoCodeId_categoryId: {
              promoCodeId: existing.id,
              categoryId: entry.categoryId,
            },
          },
          // usageCount is absent from both branches on purpose: on create the
          // column defaults to 0, and on update it is the one thing here that
          // is not the organizer's to set.
          create: { ...entry, promoCodeId: existing.id },
          update: { price: entry.price, usageLimit: entry.usageLimit ?? null },
        });
      }

      return rows.count;
    });

    return NextResponse.json({ updated });
  } catch (error: any) {
    console.error('Promo Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.promoCode.findFirst({
      where: { id, organizerId: auth.id },
      select: { id: true, batchLabel: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 });
    }

    const deleted = await prisma.promoCode.deleteMany({
      where: batchWhere(existing, auth.id),
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (error: any) {
    console.error('Promo Delete Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * The rows an operation on this promotion should touch.
 *
 * A batch is one promotion, so every voucher sharing its label goes with it.
 * Named once because editing, pausing and deleting all have to agree about
 * that — a pause that caught only one voucher out of two hundred would leave
 * a promotion quietly disagreeing with itself.
 */
function batchWhere(
  promo: { id: string; batchLabel: string | null },
  organizerId: string,
) {
  return promo.batchLabel
    ? { organizerId, batchLabel: promo.batchLabel }
    : { id: promo.id };
}
