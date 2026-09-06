/**
 * The organizer's verdict on one registration: its payment status, and the
 * validator's own notes about it.
 *
 * **This route had no auth check at all.** It was the only one of the admin
 * API routes that never called getAuthCookie, and it never scoped to the
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
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { getSignedInUser } from '@/lib/signed-in-user';
import { sendRegistrationConfirmationEmail } from '@/lib/email';

/**
 * The statuses an organizer may set from the admin. Guarded rather than
 * trusted, like every other coded column in the schema (PROJECT_GUIDE §9): an
 * unrecognised string here would sit in the column forever and quietly drop
 * the row out of the slot count, which reads PAID and PENDING only.
 */
const ALLOWED_STATUSES = ['PAID', 'PENDING', 'CANCELLED', 'REFUNDED'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
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

    // Scoped to the signed-in organizer's own events. A super admin is the one
    // account that legitimately reaches every organizer's registrations.
    if (auth.role !== 'SUPER_ADMIN' && existing.event.organizerId !== auth.id) {
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

    const updatedRegistration = await prisma.registration.update({
      where: { id },
      data,
    });

    // Manual (bank transfer) registrations only reach PAID here, once an admin
    // checks the proof — the online flow's equivalent moment is the PayMongo
    // webhook, which sends the same email from there instead. Sent on the
    // transition only: a second PATCH that changes just the remarks must not
    // send the runner a second receipt.
    if (wantsStatus && status === 'PAID' && existing.status !== 'PAID') {
      const full = await prisma.registration.findUnique({
        where: { id },
        include: { event: true, runners: { include: { category: true } } },
      });
      if (full) await sendRegistrationConfirmationEmail(full);
    }

    return NextResponse.json({ success: true, registration: updatedRegistration });
  } catch (error: any) {
    console.error('Error updating registration:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
