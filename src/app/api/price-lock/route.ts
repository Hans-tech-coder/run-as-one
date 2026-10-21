import { NextResponse } from 'next/server';
import { createPriceLock } from '@/lib/price-lock';
import { PRICE_LOCK_RULE, allowRequest, callerKey } from '@/lib/rate-limit';

/**
 * Hands a runner's form its price lock (lib/price-lock.ts): a signed time, so
 * the checkout can price the order at the moment the runner started as well
 * as at now.
 *
 * **No database read**, on purpose. The wizard calls this at the first
 * keystroke, and an extra Neon wake per form opened is the cost this project
 * watches. An event id that names nothing gets a token no checkout will ever
 * match against, which is harmless: the token carries a time, never an amount,
 * and a checkout for an event reads only a lock whose subject is that event.
 *
 * Throttled like every route anyone can call (`PRICE_LOCK_RULE`). A refused
 * caller is told so with a 429: there is nothing about a lock worth hiding, and
 * a form without one simply prices at now, as it did before locks existed.
 */
export async function POST(request: Request) {
  try {
    if (!allowRequest('price-lock', callerKey(request), PRICE_LOCK_RULE)) {
      return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
    // An id is a cuid; anything far longer is not one of ours and is not
    // worth signing.
    if (!eventId || eventId.length > 64) {
      return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
    }

    const lock = await createPriceLock(eventId);
    return NextResponse.json({
      token: lock.token,
      lockedAt: lock.lockedAt.toISOString(),
      expiresAt: lock.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Price Lock Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
