import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { AuditChanges, recordAudit } from '@/lib/audit';
import { MAX_PROMO_CODE_LENGTH, limitCountsRunners, normalizePromoCode } from '@/lib/discount';
import { MAX_VOUCHER_BATCH, newVoucherCodes } from '@/lib/voucher-codes';
import { promoTermsFromInput, wholeNumber } from '@/lib/promo-input';

/**
 * Creating a promotion: one code, a batch of single-use vouchers in one go, or
 * one that needs no code at all.
 *
 * The terms themselves are validated by `lib/promo-input.ts`, which the edit
 * route shares — a check that lived here alone would be a check an edit could
 * walk straight past.
 *
 * Promotions are organizer-wide marketing, so creating one is `promo:manage`,
 * which only OWNER and ADMIN hold. The promotion belongs to the organizer and
 * the trail names who on its team created it.
 */

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(actor, 'promo:manage', { organizerId: actor.orgId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { code, batchLabel, batchCount, batchPrefix } = body;

    // A promotion nobody has to be told about: it applies on its own to any
    // order that meets its conditions. Its `code` column then holds its name,
    // and the runner-facing code lookup skips it entirely.
    const isAutomatic = body.automatic === true;

    const terms = await promoTermsFromInput(body, actor.orgId);
    if ('problem' in terms) {
      return NextResponse.json(terms.problem, { status: 400 });
    }
    const shared = { ...terms.data, organizerId: actor.orgId };

    // ── A batch of single-use vouchers ────────────────────────────────────
    //
    // "Single use" is a usage limit of 1 rather than a flag of its own: the
    // cap already existed and one redemption is exactly what it describes.
    // What makes a batch a batch is the label they share, so two hundred codes
    // read as one promotion on the marketing screen.
    //
    // A batch of vouchers is codes by definition, so an automatic promotion
    // never takes this branch however the form was filled in.
    const count = isAutomatic ? null : wholeNumber(batchCount);
    if (count) {
      if (count > MAX_VOUCHER_BATCH) {
        return NextResponse.json(
          { error: `Generate at most ${MAX_VOUCHER_BATCH} vouchers at a time.`, field: 'batchCount' },
          { status: 400 }
        );
      }
      const label = String(batchLabel ?? '').trim();
      if (!label) {
        return NextResponse.json(
          { error: 'Name this batch, so its vouchers can be told apart from the next one.', field: 'batchLabel' },
          { status: 400 }
        );
      }

      const prefix = normalizePromoCode(batchPrefix).replace(/[^A-Z0-9]/g, '');
      const codes = newVoucherCodes(prefix, count);

      // createMany with skipDuplicates rather than a uniqueness check first:
      // the codes are random, a collision is vanishingly unlikely, and asking
      // the database to enforce it is both correct and one round trip.
      const created = await prisma.$transaction(async tx => {
        const rows = await tx.promoCode.createMany({
          data: codes.map(voucher => ({
            ...shared,
            code: voucher,
            // Single use by construction, whichever limit the form chose: what
            // makes a voucher a voucher is that it is spent once. A date window
            // set beside it still applies, since `shared` carries it.
            usageLimit: 1,
            batchLabel: label,
          })),
          skipDuplicates: true,
        });

        // The category restriction, for every voucher in the batch, in the
        // same transaction: a voucher saved without its categories would
        // discount a runner the organizer meant to leave at full price.
        // createMany cannot nest the rows, so the new vouchers are read back
        // by the codes just generated — not by label alone, which an older
        // batch of the same name could share.
        if (terms.categoryIds.length > 0) {
          const vouchers = await tx.promoCode.findMany({
            where: { organizerId: actor.orgId, code: { in: codes } },
            select: { id: true },
          });
          await tx.promoCategory.createMany({
            data: vouchers.flatMap(voucher =>
              terms.categoryIds.map(categoryId => ({ promoCodeId: voucher.id, categoryId })),
            ),
            skipDuplicates: true,
          });
        }

        // One row for the batch, not one per voucher: the organizer made one
        // decision, and the codes themselves are not worth copying into a log.
        await recordAudit(tx, actor, {
          action: 'promo.created',
          entityType: 'PromoCode',
          eventId: shared.eventId,
          summary: `Generated ${rows.count} single-use vouchers in batch ${label}.`,
          changes: {
            batchLabel: label,
            vouchers: rows.count,
            discountType: shared.discountType,
            ...auditedTerms(shared, terms.categoryIds),
          },
        });

        return rows;
      });

      return NextResponse.json({ batchLabel: label, created: created.count });
    }

    // ── One code, or one automatic promotion ──────────────────────────────
    //
    // Both land in the same column, because both answer the same question:
    // what do we call this promotion when we show it to a runner.
    const cleaned = normalizePromoCode(code);
    if (!cleaned) {
      return NextResponse.json(
        {
          error: isAutomatic
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

    const clash = await prisma.promoCode.findFirst({
      where: { organizerId: actor.orgId, code: cleaned },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        {
          error: isAutomatic
            ? `You already have a promotion called ${cleaned}.`
            : `You already have a code called ${cleaned}.`,
          field: 'code',
        },
        { status: 400 }
      );
    }

    const promo = await prisma.$transaction(async tx => {
      const row = await tx.promoCode.create({
        data: {
          ...shared,
          code: cleaned,
          // Written in the same statement as the promotion rather than after it:
          // a CATEGORY_PRICE promotion with no prices is one the event page
          // would advertise and the checkout would ignore, and two statements
          // are two chances to end up in exactly that state.
          ...(terms.categoryPrices.length > 0
            ? { categoryPrices: { create: terms.categoryPrices } }
            : {}),
          // The category restriction, for the same reason in the same
          // statement: a restricted code saved without its categories would
          // discount every runner.
          ...(terms.categoryIds.length > 0
            ? { categories: { create: terms.categoryIds.map(categoryId => ({ categoryId })) } }
            : {}),
        },
      });

      await recordAudit(tx, actor, {
        action: 'promo.created',
        entityType: 'PromoCode',
        entityId: row.id,
        eventId: row.eventId,
        summary: row.automatic
          ? `Created automatic promotion ${row.code}.`
          : `Created promo code ${row.code}.`,
        changes: {
          discountType: row.discountType,
          ...(terms.categoryPrices.length > 0 ? { categoryPrices: terms.categoryPrices.length } : {}),
          ...auditedTerms(row, terms.categoryIds),
        },
      });

      return row;
    });

    return NextResponse.json(promo);
  } catch (error: any) {
    console.error('Promo Creation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * What a percentage or fixed-amount promotion was created with, for the trail:
 * its value, its runner limit and how many categories it is restricted to
 * ('ALL' for none). Empty for the older kinds, whose entries already say what
 * they need.
 */
function auditedTerms(
  terms: { discountType: string; discountValue: number; usageLimit: number | null },
  categoryIds: string[],
): AuditChanges {
  if (!limitCountsRunners(terms.discountType)) return {};
  return {
    discountValue: terms.discountValue,
    ...(terms.usageLimit !== null ? { usageLimit: terms.usageLimit } : {}),
    categories: categoryIds.length > 0 ? categoryIds.length : 'ALL',
  };
}
