import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { MAX_PROMO_CODE_LENGTH, normalizePromoCode } from '@/lib/discount';
import { MAX_VOUCHER_BATCH, newVoucherCodes } from '@/lib/voucher-codes';
import { promoTermsFromInput, wholeNumber } from '@/lib/promo-input';

/**
 * Creating a promotion: one code, a batch of single-use vouchers in one go, or
 * one that needs no code at all.
 *
 * The terms themselves are validated by `lib/promo-input.ts`, which the edit
 * route shares — a check that lived here alone would be a check an edit could
 * walk straight past.
 */

export async function POST(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { code, batchLabel, batchCount, batchPrefix } = body;

    // A promotion nobody has to be told about: it applies on its own to any
    // order that meets its conditions. Its `code` column then holds its name,
    // and the runner-facing code lookup skips it entirely.
    const isAutomatic = body.automatic === true;

    const terms = await promoTermsFromInput(body, auth.id);
    if ('problem' in terms) {
      return NextResponse.json(terms.problem, { status: 400 });
    }
    const shared = { ...terms.data, organizerId: auth.id };

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
      const created = await prisma.promoCode.createMany({
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
      where: { organizerId: auth.id, code: cleaned },
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

    const promo = await prisma.promoCode.create({
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
      },
    });

    return NextResponse.json(promo);
  } catch (error: any) {
    console.error('Promo Creation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
