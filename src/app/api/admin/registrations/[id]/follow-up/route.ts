/**
 * "Log follow-up…" on the Unpaid checkouts tab (UNPAID_FOLLOWUP_PLAN.md Batch
 * 1): a staff member records how an attempt to reach the runner went, so the
 * next person on the list does not call the same runner twice.
 *
 * **Written to the audit trail, nowhere else** (decision D2, lib/follow-up.ts).
 * The order itself is not touched: logging "Will pay" holds nothing longer and
 * changes no status.
 *
 * **Open to everyone who sees the tab** (`registration:view`, decision D3),
 * VIEWER included, because staff doing follow-up is the point of the tab.
 * Scoped to the order's own race, as the status route is, and only for an
 * order the tab would list (`unpaidFollowUpWhere`): a paid order needs no
 * chasing, and a request naming one is refused rather than logged. A
 * cancelled order is refused too, though the tab can show it: it was closed
 * on purpose, so there is no one left to chase (Batch 2).
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { today } from '@/lib/event-schedule';
import { unpaidFollowUpWhere } from '@/lib/pending-expiry';
import {
  FOLLOW_UP_LABELS,
  FOLLOW_UP_NOTE_MAX,
  asFollowUpOutcome,
  type FollowUpRecord,
} from '@/lib/follow-up';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const registration = await prisma.registration.findUnique({
      where: { id },
      select: {
        id: true,
        orderRef: true,
        eventId: true,
        event: { select: { organizerId: true, date: true } },
      },
    });
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const reach = { organizerId: registration.event.organizerId, eventId: registration.eventId };
    if (!can(actor, 'registration:view', reach)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const outcome = asFollowUpOutcome(body?.outcome);
    if (!outcome) {
      return NextResponse.json({ error: 'Choose how the follow-up went.' }, { status: 400 });
    }
    const rawNote = body?.note;
    if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
      return NextResponse.json({ error: 'The note must be text.' }, { status: 400 });
    }
    const note = (rawNote ?? '').trim();
    if (note.length > FOLLOW_UP_NOTE_MAX) {
      return NextResponse.json(
        { error: `Keep the note to ${FOLLOW_UP_NOTE_MAX} characters. It is ${note.length} now.` },
        { status: 400 }
      );
    }

    const ref = registration.orderRef;
    const listed = await prisma.registration.count({
      where: {
        id,
        ...unpaidFollowUpWhere(registration.event.date, today()),
        AND: [{ status: { not: 'CANCELLED' } }],
      },
    });
    if (listed === 0) {
      return NextResponse.json(
        { error: `${ref} is no longer an unpaid checkout, so there is nothing to follow up. Reload the page.` },
        { status: 409 }
      );
    }

    const label = FOLLOW_UP_LABELS[outcome];
    await recordAudit(prisma, actor, {
      action: 'registration.followed_up',
      entityType: 'Registration',
      entityId: registration.id,
      eventId: registration.eventId,
      organizerId: registration.event.organizerId,
      summary: note ? `Followed up ${ref}: ${label}. "${note}"` : `Followed up ${ref}: ${label}.`,
      changes: note ? { outcome, note } : { outcome },
    });

    const followUp: FollowUpRecord = {
      outcome,
      note: note || null,
      by: actor.name.trim() || actor.email || 'Unknown',
      at: new Date().toISOString(),
    };
    return NextResponse.json({ followUp });
  } catch (error) {
    console.error('Follow-up log failed:', error);
    return NextResponse.json({ error: 'The follow-up could not be saved. Try again.' }, { status: 500 });
  }
}
