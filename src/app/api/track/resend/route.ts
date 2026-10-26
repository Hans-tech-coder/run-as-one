import { NextResponse } from 'next/server';
import { TRACK_LOOKUP_RULE, TRACK_RESEND_RULE, allowRequest, callerKey } from '@/lib/rate-limit';
import { readTrackToken } from '@/lib/track-link';
import { readResendTarget } from '@/lib/track';
import { maskEmail } from '@/lib/track-mask';
import { isBankTransfer } from '@/lib/registration-codes';
import { deliverConfirmationEmail, deliverReceivedEmail } from '@/lib/email-delivery';

/**
 * *Resend my confirmation email* on Track My Registration (TRACK_PAGE_PLAN.md
 * §5, §6).
 *
 * **To the address on file only.** It sends the order's own email to the
 * order's contact (`customerEmail`), exactly the one the checkout or the
 * receipt sent: the receipt once the order is PAID, the "received" email while
 * a bank transfer waits for validation. Nothing the caller sends can point it
 * anywhere else, so it cannot be used to mail somebody's details to a stranger.
 *
 * **Proved by the page's own token**, the short-lived track token the lookup
 * or the emailed link handed out (lib/track-link.ts), not by a reference and
 * email posted again: the browser never has to keep the email.
 *
 * **Throttled per order** (`TRACK_RESEND_RULE`, 2 an hour) as well as per
 * address, because each send spends one of Resend's 100 free recipients a day.
 * A send that fails says so, and points at the contact channels on the page.
 * The outcome is written onto the order like any other send (email-delivery.ts).
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

const GONE = 'This page has been open a while. Look up your registration again, then press Resend.';

export async function POST(request: Request) {
  // Its own bucket, so lookups from a shared address (a family, a carrier's
  // NAT) never use up the Resend button too.
  if (!allowRequest('track-resend-caller', callerKey(request), TRACK_LOOKUP_RULE)) {
    return reply({ error: 'Too many tries from your connection. Wait a minute, then try again.' }, 429);
  }

  let token: unknown;
  try {
    token = (await request.json())?.token;
  } catch {
    token = null;
  }
  const scope = typeof token === 'string' ? await readTrackToken(token) : null;
  if (!scope) return reply({ error: GONE }, 401);

  const order = await readResendTarget(scope.registrationId);
  if (!order || order.deletedAt || order.runners.length === 0) return reply({ error: GONE }, 401);

  const sendsReceipt = order.status === 'PAID';
  const sendsReceived = order.status === 'PENDING' && isBankTransfer(order.paymentMethod);
  if (!sendsReceipt && !sendsReceived) {
    return reply({ error: 'There is no confirmation email to resend for this registration yet.' }, 409);
  }

  if (!allowRequest('track-resend', order.id, TRACK_RESEND_RULE)) {
    return reply(
      { error: 'This email was already resent twice in the last hour. Check your spam folder, or contact us below.' },
      429,
    );
  }

  const outcome = await (sendsReceipt ? deliverConfirmationEmail : deliverReceivedEmail)(order);
  if (!outcome.sent) {
    return reply({ error: 'We could not send the email just now. Contact us below and we will send it by hand.' }, 502);
  }
  return reply({ sentTo: maskEmail(order.customerEmail) });
}
