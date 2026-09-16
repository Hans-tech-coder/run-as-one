/**
 * The organizer's verdict on one registration: its payment status, and the
 * validator's own notes about it.
 *
 * **This route had no auth check at all.** It was the only one of the admin
 * API routes that never checked the session, and it never scoped to the
 * signed-in organizer — so anyone who guessed a registration id could mark it
 * PAID and trigger a receipt email for a payment nobody made. The proxy does
 * not cover /api/**, so the check has to live here (PROJECT_GUIDE §7). It is
 * fixed in the same change that adds remarks, because bolting a new feature
 * onto an unauthenticated route would have been worse than leaving it alone.
 *
 * Remarks are **internal**. Nothing here emails the runner about them: an
 * assigned staff member reads the note and reaches out by hand, which is what
 * the organizer asked for. The only email this route sends is the receipt,
 * and only on the transition into PAID.
 *
 * **Both halves go in the trail**, in the transaction that writes them: a
 * status change names the order and what it moved from, and a remark records
 * what it said. This is the route an argument about a payment is traced back
 * through, so it is the one that most needs to say who.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { changedFields, recordAudit, type AuditEntry } from '@/lib/audit';
import { getSignedInUser } from '@/lib/signed-in-user';
import { deliverConfirmationEmail } from '@/lib/email-delivery';

/**
 * The statuses an organizer may set from the admin. Guarded rather than
 * trusted, like every other coded column in the schema (PROJECT_GUIDE §9): an
 * unrecognised string here would sit in the column forever and quietly drop
 * the row out of the slot count, which reads PAID and PENDING only.
 *
 * EXPIRED is listed because it is a status this app can hold, and a vocabulary
 * that refuses a value already in the column would make an organizer unable to
 * put a row back the way they found it. It is normally written by the sweep in
 * lib/pending-expiry.ts rather than by hand — and setting it here is not the
 * same act: the sweep also hands back the promo redemption that order took,
 * which nothing on this route does. Cancelling an order an organizer decided
 * about is what CANCELLED is for.
 */
const ALLOWED_STATUSES = ['PAID', 'PENDING', 'CANCELLED', 'REFUNDED', 'EXPIRED'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, remarks } = body;

    // Two independent edits down one route: a status change, a remark, or
    // both. Requiring one of them means an empty body cannot silently stamp a
    // "remarks cleared by" line onto a registration nobody touched.
    const wantsStatus = status !== undefined;
    const wantsRemarks = remarks !== undefined;
    if (!wantsStatus && !wantsRemarks) {
      return NextResponse.json(
        { error: 'Nothing to update. Send a status, remarks, or both.' },
        { status: 400 }
      );
    }

    if (wantsStatus && !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Unknown status "${status}".` },
        { status: 400 }
      );
    }

    const existing = await prisma.registration.findUnique({
      where: { id },
      include: { event: { select: { organizerId: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    // Scoped to the actor's own organizer, and for a STAFF member to a race
    // where their role covers what was sent: settling an order and writing a
    // note about it are separate permissions (lib/permissions.ts). A super
    // admin is the one account that legitimately reaches every organizer's
    // registrations.
    const reach = { organizerId: existing.event.organizerId, eventId: existing.eventId };
    if (
      (wantsStatus && !can(actor, 'registration:validate', reach)) ||
      (wantsRemarks && !can(actor, 'registration:remark', reach))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data: {
      status?: string;
      remarks?: string | null;
      remarksBy?: string | null;
      remarksAt?: Date | null;
    } = {};

    if (wantsStatus) data.status = status;

    if (wantsRemarks) {
      const text = typeof remarks === 'string' ? remarks.trim() : '';
      // Deliberately not uppercased: this is the organizer's own prose about a
      // payment, not registrant data, and the uppercase rule stops at what a
      // runner typed about themselves (lib/text-case.ts).
      data.remarks = text || null;
      // Cleared together with the note. A "who wrote it" line left standing
      // over an empty remark claims someone said something they did not.
      if (text) {
        const user = await getSignedInUser();
        data.remarksBy = user?.name ?? null;
        data.remarksAt = new Date();
      } else {
        data.remarksBy = null;
        data.remarksAt = null;
      }
    }

    const updatedRegistration = await prisma.$transaction(async tx => {
      const updated = await tx.registration.update({
        where: { id },
        data,
      });

      const entries: AuditEntry[] = [];
      const trail = {
        entityType: 'Registration' as const,
        entityId: id,
        eventId: existing.eventId,
        organizerId: existing.event.organizerId,
      };

      if (wantsStatus && existing.status !== updated.status) {
        entries.push({
          ...trail,
          action: 'registration.status.changed',
          summary: `Marked ${existing.orderRef} as ${updated.status} (was ${existing.status}).`,
          changes: { status: [existing.status, updated.status] },
        });
      }

      if (wantsRemarks) {
        const changes = changedFields(existing, updated, ['remarks']);
        if (Object.keys(changes).length > 0) {
          entries.push({
            ...trail,
            action: 'registration.remarks.changed',
            summary: !updated.remarks
              ? `Cleared the remarks on ${existing.orderRef}.`
              : existing.remarks
                ? `Rewrote the remarks on ${existing.orderRef}.`
                : `Added remarks to ${existing.orderRef}.`,
            changes,
          });
        }
      }

      await recordAudit(tx, actor, entries);
      return updated;
    });

    // Manual (bank transfer) registrations only reach PAID here, once an admin
    // checks the proof — the online flow's equivalent moment is the PayMongo
    // webhook, which sends the same email from there instead. Sent on the
    // transition only: a second PATCH that changes just the remarks must not
    // send the runner a second receipt.
    if (wantsStatus && status === 'PAID' && existing.status !== 'PAID') {
      const full = await prisma.registration.findUnique({
        where: { id },
        include: {
          event: true,
          // A runner removed from the order is not on the receipt.
          runners: { where: { deletedAt: null }, include: { category: true } },
        },
      });
      if (full) await deliverConfirmationEmail(full);
    }

    // Who just moved the status, for the registrant modal's "Validated by"
    // line — the same name the trail entry above snapshotted, so the screen
    // and the trail cannot disagree about who did it.
    const statusChange =
      wantsStatus && existing.status !== updatedRegistration.status
        ? { by: actor.name, at: new Date().toISOString(), to: updatedRegistration.status }
        : null;

    return NextResponse.json({ success: true, registration: updatedRegistration, statusChange });
  } catch (error: any) {
    console.error('Error updating registration:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
