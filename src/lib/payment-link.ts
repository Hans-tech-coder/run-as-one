import prisma from '@/lib/db';
import { can, type Actor } from '@/lib/actor';
import type { RegistrationWithDetails } from '@/lib/email';
import { formatEventInstant, today } from '@/lib/event-schedule';
import { expiresBy, extendedHold, unpaidFollowUpWhere } from '@/lib/pending-expiry';
import {
  createResumePaymentToken,
  payableState,
  resumePaymentUrl,
  type PayableState,
} from '@/lib/resume-payment';

/**
 * Handing a payment link to staff (UNPAID_FOLLOWUP_PLAN.md Batches 3 and 4):
 * the one path Copy payment link, Send payment link and Send by hand all take,
 * so the three cannot disagree about who may have a link, for which order, or
 * how long it lives. Moved out of the payment-link route when the email ways
 * of sending it arrived.
 *
 * **`registration:email`** (decision D3): a link lets whoever holds it pay, so
 * it goes out on the same permission as any other message to the runner.
 * Scoped to the order's own race, and only for an order the Unpaid checkouts
 * tab lists and that can still be paid (`payableState`). An expired order is
 * refused; its row offers the event's registration link instead (decision D5).
 *
 * **It moves the hold, once** (decision D4). A link given at hour 20 would die
 * with the order a few hours later, so the first link for an order holds its
 * slot for `PAYMENT_LINK_HOLD_HOURS` from now, never past race day
 * (`extendedHold`). Every later link, by any of the three ways, keeps that
 * hold and expires with it. The claim is conditional on `holdUntil` still
 * being null, so two staff members at once move it once.
 *
 * What is recorded on the trail is the caller's to write, because only the
 * caller knows what became of the link: copied, emailed, or prepared to send
 * by hand. `moved` says whether this call is the one that moved the hold.
 */

const REFUSALS: Record<Exclude<PayableState, 'payable'>, string> = {
  paid: 'is already paid, so there is nothing left to pay. Reload the page.',
  cancelled: 'was cancelled, so it can no longer be paid.',
  expired: 'has expired: its slot was released. Copy the registration link instead, so the runner registers again.',
  unavailable: 'cannot be paid online any more. Its payment method is no longer offered, or a runner was removed from it.',
};

export type IssuedPaymentLink = {
  ok: true;
  /** With the event and its live runners, everything the email renders from. */
  registration: RegistrationWithDetails;
  url: string;
  /** When the link stops working: the tab's "Expires by". */
  until: Date;
  untilLabel: string;
  /** The new hold, when this call is the one that moved it. */
  moved: Date | null;
};

export type RefusedPaymentLink = { ok: false; status: number; error: string };

export async function issuePaymentLink(
  id: string,
  actor: Actor,
  origin: string,
  now: Date = new Date(),
): Promise<IssuedPaymentLink | RefusedPaymentLink> {
  const registration = await prisma.registration.findUnique({
    where: { id },
    include: {
      event: true,
      // A runner removed from the order is not in the email, nor counted.
      runners: { where: { deletedAt: null }, include: { category: true } },
      _count: { select: { runners: { where: { deletedAt: { not: null } } } } },
    },
  });
  if (!registration) return { ok: false, status: 404, error: 'Registration not found' };

  const reach = { organizerId: registration.event.organizerId, eventId: registration.eventId };
  if (!can(actor, 'registration:email', reach)) return { ok: false, status: 401, error: 'Unauthorized' };

  const listed = await prisma.registration.count({
    where: { id, ...unpaidFollowUpWhere(registration.event.date, today()) },
  });
  const state = listed === 0
    ? 'unavailable'
    : payableState(
        {
          ...registration,
          liveRunners: registration.runners.length,
          removedRunners: registration._count.runners,
        },
        now,
      );
  if (state !== 'payable') {
    return { ok: false, status: 409, error: `${registration.orderRef} ${REFUSALS[state]}` };
  }

  // The first link moves the hold. Conditional, so a second link landing at
  // the same moment finds it already moved and leaves it.
  let holdUntil = registration.holdUntil;
  let moved: Date | null = null;
  const extended = extendedHold(registration, registration.event.date, now);
  if (extended) {
    const claim = await prisma.registration.updateMany({
      where: { id, status: 'PENDING', holdUntil: null },
      data: { holdUntil: extended },
    });
    if (claim.count > 0) {
      holdUntil = moved = extended;
    } else {
      holdUntil = (await prisma.registration.findUnique({ where: { id }, select: { holdUntil: true } }))?.holdUntil ?? null;
    }
  }
  // The link lives exactly as long as the tab's "Expires by" says the order does.
  const until = expiresBy(registration.createdAt, holdUntil);
  const token = await createResumePaymentToken(id, until);

  return {
    ok: true,
    registration: { ...registration, holdUntil },
    url: resumePaymentUrl(origin, token),
    until,
    untilLabel: formatEventInstant(until),
    moved,
  };
}
