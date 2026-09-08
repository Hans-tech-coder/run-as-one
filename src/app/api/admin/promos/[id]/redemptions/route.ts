import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { MAX_REDEMPTIONS_LISTED, redemptionsFor } from '@/lib/promo-redemptions';

/**
 * Which orders used this promotion.
 *
 * The marketing table can say a promotion was redeemed twelve times and has
 * given away ₱4,500; it cannot say *by whom*, which is the next question an
 * organizer asks — usually because one of those orders looks wrong, or because
 * a voucher meant for one named invitee was clearly passed around.
 *
 * **A batch is one promotion**, so this returns the orders for every code
 * sharing the batch label, and each row names the specific code that was used.
 * Inside a batch that is the only thing telling one redemption from another,
 * and it is what turns "somebody used these" into "this voucher went here".
 *
 * Auth-checked and scoped to the signed-in organizer's own events, like every
 * other admin route. It matters twice here: an id from the browser is not
 * proof the promotion belongs to the browser's owner, and the code *text* is
 * not proof either — two organizers may each run an `EARLYBIRD`, and matching
 * on text alone would hand one of them the other's orders.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const promo = await prisma.promoCode.findFirst({
      where: { id, organizerId: auth.id },
      select: { id: true, code: true, batchLabel: true, automatic: true },
    });
    if (!promo) {
      return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 });
    }

    // The same rule the edit, pause and delete route follows: an operation on
    // any member of a batch is an operation on the whole batch.
    const codes = promo.batchLabel
      ? (
          await prisma.promoCode.findMany({
            where: { organizerId: auth.id, batchLabel: promo.batchLabel },
            select: { code: true },
          })
        ).map(row => row.code)
      : [promo.code];

    const { redemptions, truncated } = await redemptionsFor(codes, auth.id);

    return NextResponse.json({
      name: promo.batchLabel ?? promo.code,
      /** Whether a row should name which voucher was used. */
      isBatch: Boolean(promo.batchLabel),
      automatic: promo.automatic,
      redemptions,
      truncated,
      limit: MAX_REDEMPTIONS_LISTED,
    });
  } catch (error: any) {
    console.error('Promo Redemptions Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
