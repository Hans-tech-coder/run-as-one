import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { changedFields, recordAudit, type AuditEntry } from '@/lib/audit';
import { formatEventInstant } from '@/lib/event-schedule';
import { OPENING_INSTANT_ERROR, asOpeningInstant } from '@/lib/registration-gate';

// Split out of route.ts, which re-exports it as PATCH.

/**
 * When sign-ups are open — the manual hold and the scheduled opening — on
 * their own.
 *
 * Separate from PUT because the events table changes these in place: sending
 * the whole event back to flip one boolean would mean the table holding — and
 * re-posting — every field of a form it does not show, and any of those it got
 * subtly wrong would be silently written.
 *
 * Three fields: `{ registrationPaused }` from the menu's pause item,
 * `{ registrationOpensAt }` from its scheduling modal, and
 * `{ registrationClosed }` from its close / reopen item. The last is a
 * boolean on the wire and an instant in the column — the server stamps when,
 * so the time on the trail is the server's and not the browser's. A body
 * carrying none is rejected rather than treated as a no-op save, because a request
 * that changed nothing is a bug somewhere upstream, not an instruction.
 *
 * Setting an opening on its own also lifts a manual hold. Both answers the
 * modal offers — open now, or open on this date — are the organizer saying
 * when sign-ups happen, and leaving a hold standing underneath either of them
 * would mean the date arrives and nothing opens. A caller that sends both
 * fields is taken at its word instead, and neither is inferred from the other.
 *
 * Like PUT, this scopes the update to the actor's own organizer's events:
 * "who owns this id" is a question every handler here has to ask, since the id
 * arrives from the browser.
 */
export async function updateRegistrationControls(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const pausing = Object.prototype.hasOwnProperty.call(body, 'registrationPaused');
    const scheduling = Object.prototype.hasOwnProperty.call(body, 'registrationOpensAt');
    const closing = Object.prototype.hasOwnProperty.call(body, 'registrationClosed');

    if (!pausing && !scheduling && !closing) {
      return NextResponse.json(
        { error: 'Send registrationPaused, registrationOpensAt or registrationClosed.' },
        { status: 400 }
      );
    }

    if (closing && typeof body.registrationClosed !== 'boolean') {
      return NextResponse.json(
        { error: 'registrationClosed must be true or false.' },
        { status: 400 }
      );
    }

    if (pausing && typeof body.registrationPaused !== 'boolean') {
      return NextResponse.json(
        { error: 'registrationPaused must be true or false.' },
        { status: 400 }
      );
    }

    const registrationOpens = scheduling ? asOpeningInstant(body.registrationOpensAt) : null;
    if (registrationOpens === undefined) {
      return NextResponse.json({ error: OPENING_INSTANT_ERROR }, { status: 400 });
    }

    const event = await db.event.findUnique({
      where: { id },
      select: {
        id: true,
        organizerId: true,
        title: true,
        registrationPaused: true,
        registrationPauseNote: true,
        registrationOpensAt: true,
        registrationClosedAt: true,
      },
    });

    // A race the actor may not edit reads exactly like one that does not exist,
    // as on GET and PUT above, so its id cannot be confirmed by probing.
    if (!event || !can(actor, 'event:edit', { organizerId: event.organizerId, eventId: id })) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.event.update({
        where: { id },
        data: {
          ...(pausing
            ? {
                registrationPaused: body.registrationPaused,
                // Only written when the caller sent one, so toggling from the
                // events table never wipes a note the organizer wrote in the
                // edit form.
                ...(body.registrationPauseNote === undefined
                  ? {}
                  : { registrationPauseNote: body.registrationPauseNote?.trim() || null }),
              }
            : {}),
          ...(scheduling
            ? {
                registrationOpensAt: registrationOpens,
                // See the note above: an opening date set on its own is also the
                // answer to a hold, or the date would arrive to a paused event.
                ...(pausing ? {} : { registrationPaused: false }),
              }
            : {}),
          ...(closing
            ? {
                // Closing an already-closed event keeps the original instant,
                // so a double-click cannot move the date on the trail.
                registrationClosedAt: body.registrationClosed
                  ? event.registrationClosedAt ?? new Date()
                  : null,
              }
            : {}),
        },
        select: {
          id: true,
          registrationPaused: true,
          registrationPauseNote: true,
          registrationOpensAt: true,
          registrationClosedAt: true,
        },
      });

      const changes = changedFields(event, row, [
        'registrationPaused',
        'registrationPauseNote',
        'registrationOpensAt',
        'registrationClosedAt',
      ]);
      if (Object.keys(changes).length > 0) {
        const entry: AuditEntry = 'registrationClosedAt' in changes
          ? row.registrationClosedAt
            ? { action: 'event.registration.closed', entityType: 'Event', summary: `Closed sign-ups on ${event.title}.` }
            : { action: 'event.registration.reopened', entityType: 'Event', summary: `Reopened sign-ups on ${event.title}.` }
          : scheduling
          ? {
              action: 'event.registration.scheduled',
              entityType: 'Event',
              summary: row.registrationOpensAt
                ? `Scheduled sign-ups on ${event.title} to open ${formatEventInstant(row.registrationOpensAt)}.`
                : `Opened sign-ups on ${event.title} now.`,
            }
          : row.registrationPaused
            ? { action: 'event.registration.paused', entityType: 'Event', summary: `Paused sign-ups on ${event.title}.` }
            : { action: 'event.registration.resumed', entityType: 'Event', summary: `Resumed sign-ups on ${event.title}.` };
        await recordAudit(tx, actor, {
          ...entry,
          entityId: id,
          eventId: id,
          organizerId: event.organizerId,
          changes,
        });
      }

      return row;
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Registration availability error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update registration status' },
      { status: 500 }
    );
  }
}
