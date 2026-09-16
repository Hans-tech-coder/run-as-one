import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getActor } from '@/lib/actor';
import { recordAudit, type AuditAction, type AuditChanges } from '@/lib/audit';
import {
  asOrganizerStatus,
  canDecide,
  organizerStatusLabel,
  readStatusNote,
  type OrganizerStatus,
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
 * **Every decision writes one audit row, in the same transaction as the
 * status** (`lib/audit.ts`): approved, rejected, suspended or reinstated. The
 * row belongs to **the super admin's own trail** (`actor.orgId`), not to the
 * organizer decided about: an organizer's `/admin/activity` is what happened
 * inside their dashboard, and it shows each actor's IP address and device,
 * which a platform decision has no business handing to the applicant. The
 * organizer is named by `entityType: 'Organizer'` and `entityId`, which is how
 * "who approved this account?" is asked. `changes` carries the status it moved from and to and, for a
 * rejection, the reason. The reason is kept whole on purpose: it was written
 * to be read by this very applicant, and the organizer row's `statusNote` is
 * cleared by the next decision, so the trail is the one place it survives.
 * The summary names the organization and never quotes the reason.
 *
 * This route used to take `adminFee` as well. That column is read by nothing
 * that charges a runner — every peso comes from `Event.adminFee`, which the
 * organizer sets per event — so a body carrying it is refused by name rather
 * than silently ignored: a caller still sending it believes it changes a fee,
 * and it does not.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor || actor.kind !== 'SUPER_ADMIN') {
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
    const record = decisionRecord(current.status, status, current.name, statusNote);
    const count = await prisma.$transaction(async tx => {
      const moved = await tx.organizer.updateMany({
        where: { id, role: 'ORGANIZER', status: current.status },
        data: { status, statusNote, statusChangedAt },
      });
      if (moved.count === 0) return 0;
      await recordAudit(tx, actor, {
        action: record.action,
        entityType: 'Organizer',
        entityId: id,
        summary: record.summary,
        changes: record.changes,
      });
      return moved.count;
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

/**
 * The trail's name for a decision. Approving from Suspended is a
 * reinstatement; approving from anywhere else — a new application, or a
 * rejection reconsidered — is an approval, and the `status` change says which.
 */
function decisionRecord(
  from: string,
  to: OrganizerStatus,
  organizerName: string,
  reason: string | null,
): { action: AuditAction; summary: string; changes: AuditChanges } {
  const name = organizerName.trim() || 'this organizer';
  const changes: AuditChanges = { status: [from, to] };
  if (to === 'REJECTED') {
    changes.reason = reason;
    return {
      action: 'organizer.rejected',
      summary: `Rejected the organizer application for ${name}`,
      changes,
    };
  }
  if (to === 'SUSPENDED') {
    return { action: 'organizer.suspended', summary: `Suspended the organizer account ${name}`, changes };
  }
  if (from === 'SUSPENDED') {
    return { action: 'organizer.reinstated', summary: `Reinstated the organizer account ${name}`, changes };
  }
  return {
    action: 'organizer.approved',
    summary:
      from === 'REJECTED'
        ? `Approved the organizer application for ${name}, which had been rejected`
        : `Approved the organizer application for ${name}`,
    changes,
  };
}
