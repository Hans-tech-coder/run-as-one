import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import {
  asOrganizerStatus,
  canDecide,
  organizerStatusLabel,
  readStatusNote,
} from '@/lib/organizer-status';
import {
  sendOrganizerApprovedEmail,
  sendOrganizerRejectedEmail,
  type OrganizerDecisionInput,
} from '@/lib/email';
import { inviteOrigin } from '@/lib/team-invite';

/**
 * A super admin's decision on one organizer: approve, reject or suspend.
 *
 * The status is guarded by `asOrganizerStatus` and the move by `canDecide`
 * (lib/organizer-status.ts), so this door accepts exactly the buttons the
 * screen offers: a pending application is approved or rejected, an approved
 * account suspended, a suspended or rejected one approved. Nothing moves an
 * account back to `PENDING`.
 *
 * **A rejection must carry its reason** (`note`), refused per field under
 * `errors.note` so the dialog lands the message beside its box. Every other
 * decision clears the stored reason, so a reinstated account does not keep the
 * sentence it was once refused with.
 *
 * The write is conditional on the status the decision was made from. Two super
 * admins deciding the same application at once cannot both win: the second
 * finds the row already moved and is told so rather than overwriting it.
 *
 * **The applicant is emailed on approve and on reject** (`lib/email.ts`), the
 * rejection quoting its reason. The pattern is `admin/team`'s invite: the status
 * moves first, the send happens after, and the answer carries `emailSent` /
 * `emailError` (`null` for a suspension, which emails nobody). A mail outage
 * never leaves a decision half-made — the screen says the email did not go out
 * so the super admin can reach the applicant another way.
 *
 * This route used to take `adminFee` as well. That column is read by nothing
 * that charges a runner — every peso comes from `Event.adminFee`, which the
 * organizer sets per event — so a body carrying it is refused by name rather
 * than silently ignored: a caller still sending it believes it changes a fee,
 * and it does not.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);

    if (body?.adminFee !== undefined) {
      return NextResponse.json(
        {
          error:
            'The admin fee is no longer set per organizer. Organizers set it on each event.',
        },
        { status: 400 },
      );
    }

    if (body?.status === undefined) {
      return NextResponse.json({ error: 'No data provided to update' }, { status: 400 });
    }

    const status = asOrganizerStatus(body.status);
    if (!status) {
      return NextResponse.json(
        { error: `"${String(body.status)}" is not an organizer status.` },
        { status: 400 },
      );
    }

    let statusNote: string | null = null;
    if (status === 'REJECTED') {
      const read = readStatusNote(body.note);
      if (read.error !== undefined) {
        return NextResponse.json(
          { error: read.error, errors: { note: read.error } },
          { status: 400 },
        );
      }
      statusNote = read.note;
    }

    const current = await prisma.organizer.findFirst({
      where: { id, role: 'ORGANIZER' },
      select: { status: true, name: true, email: true, contactFirstName: true },
    });
    if (!current) {
      return NextResponse.json({ error: 'Organizer not found.' }, { status: 404 });
    }

    if (!canDecide(current.status, status)) {
      return NextResponse.json(
        {
          error: `A ${organizerStatusLabel(current.status).toLowerCase()} account cannot be moved to ${organizerStatusLabel(status).toLowerCase()}.`,
        },
        { status: 409 },
      );
    }

    const statusChangedAt = new Date();
    const { count } = await prisma.organizer.updateMany({
      where: { id, role: 'ORGANIZER', status: current.status },
      data: { status, statusNote, statusChangedAt },
    });
    if (count === 0) {
      return NextResponse.json(
        { error: 'This account was changed by somebody else just now. Refresh and look again.' },
        { status: 409 },
      );
    }

    // The decision is saved; only now is the applicant told. A suspension
    // sends nothing — it is not a decision on an application.
    const decision: OrganizerDecisionInput = {
      to: current.email,
      organizerName: current.name,
      contactFirstName: current.contactFirstName,
      from: current.status,
      origin: inviteOrigin(request),
    };
    const outcome =
      status === 'APPROVED'
        ? await sendOrganizerApprovedEmail(decision)
        : status === 'REJECTED' && statusNote
          ? await sendOrganizerRejectedEmail({ ...decision, reason: statusNote })
          : null;

    return NextResponse.json({
      success: true,
      organizer: { id, status, statusNote, statusChangedAt },
      emailSent: outcome ? outcome.sent : null,
      emailError: outcome && !outcome.sent ? outcome.error : null,
    });
  } catch (error) {
    console.error('Failed to update organizer:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
