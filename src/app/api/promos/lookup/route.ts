import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { MAX_PROMO_CODE_LENGTH, normalizePromoCode } from '@/lib/discount';
import { findPromoCode, promoTerms } from '@/lib/promo-store';
import { PROMO_LOOKUP_RULE, allowRequest, callerKey } from '@/lib/rate-limit';

/**
 * The public half of the promo feature: what a code a runner just typed is,
 * so the wizard can price it.
 *
 * It returns the code's *terms*, not a computed discount. The order changes
 * under the runner after they apply a code — they add a fourth runner, they
 * switch from pickup to delivery — and a server-computed amount would go stale
 * the moment they did. The wizard therefore recomputes with `applyPromo` from
 * lib/discount.ts on every keystroke, from the same module both checkout
 * routes use as their last word. Nothing here is trusted at checkout.
 *
 * A missing code comes back as `{ promo: null }` with a 200 rather than a 404:
 * "we don't have that code" is an answer, not a failure, and the sentence the
 * runner reads is written once in `promoCodeError` rather than twice.
 *
 * A promo code is meant to be shared, so there is no secret here to protect —
 * but nothing stopped a script walking the alphabet against this route either,
 * one guess per request, for as long as it liked. `lib/rate-limit.ts` is the
 * throttle, and its own comment is honest about how far it reaches.
 */
export async function POST(request: Request) {
  try {
    // Before the body is read, let alone the database: a refusal should cost
    // this route less than the request that earned it.
    //
    // A throttled caller is answered exactly as a caller whose code we do not
    // have. A distinct "slow down" would make this endpoint a *better* oracle
    // when throttled than when open — every refusal would confirm the guesser
    // is being counted, and the shape of the answer would still differ from a
    // miss. One answer for both means a script learns nothing from being
    // caught.
    if (!allowRequest('promo-lookup', callerKey(request), PROMO_LOOKUP_RULE)) {
      return NextResponse.json({ promo: null });
    }

    const { eventId, code } = await request.json();

    const cleaned = normalizePromoCode(code);
    if (!cleaned || cleaned.length > MAX_PROMO_CODE_LENGTH || !eventId) {
      return NextResponse.json({ promo: null });
    }

    const event = await prisma.event.findUnique({
      where: { id: String(eventId) },
      select: { id: true, organizerId: true },
    });
    if (!event) return NextResponse.json({ promo: null });

    const promo = await findPromoCode(event, cleaned);

    // Only the terms, never the row: the id, the batch and the organizer are
    // the admin's business, and this route answers to anyone on the internet.
    return NextResponse.json({ promo: promo ? promoTerms(promo) : null });
  } catch (error: any) {
    console.error('Promo Lookup Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
