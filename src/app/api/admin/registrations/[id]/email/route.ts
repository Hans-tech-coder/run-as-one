/**
 * The email a registration is owed, rendered for a person to send by hand —
 * and the record that they did.
 *
 * The app runs on Resend's free tier: 100 recipients a day, and it stops
 * rather than bills. When a send does not happen the registrants table marks
 * the row (see lib/email-delivery.ts) and a staff member sends the email
 * themselves, from their own mailbox. This route is what hands them the exact
 * message the runner should have received — both renderings of it, because a
 * mailto: body is plain text only while the clipboard can carry the design —
 * and what marks the registration handled afterwards.
 *
 * Auth-checked and scoped to the signed-in organizer's own events, like every
 * admin route: the proxy does not cover /api/** (PROJECT_GUIDE §7). It matters
 * more here than most — the rendered email contains every runner's contact
 * details, birthdate and emergency contact, so an unscoped GET would be a data
 * leak rather than a nuisance.
 */

import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { getSignedInUser } from '@/lib/signed-in-user';
import {
  EMAIL_KIND_LABELS,
  asEmailKind,
  emailForKind,
  latestEmailKind,
  outstandingEmail,
  recordManualSend,
} from '@/lib/email-delivery';

/** The registration plus everything either email renders from. */
const WITH_DETAILS = { event: true, runners: { include: { category: true } } } as const;

type Loaded =
  | { ok: true; registration: Prisma.RegistrationGetPayload<{ include: typeof WITH_DETAILS }> }
  | { ok: false; response: NextResponse };

/** Auth, existence and ownership in one place — both methods need all three. */
async function loadRegistration(id: string): Promise<Loaded> {
  const auth = await getAuthCookie();
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: WITH_DETAILS,
  });

  if (!registration) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Registration not found' }, { status: 404 }),
    };
  }

  // A super admin is the one account that legitimately reaches every
  // organizer's registrations.
  if (auth.role !== 'SUPER_ADMIN' && registration.event.organizerId !== auth.id) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { ok: true, registration };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadRegistration(id);
    if (!loaded.ok) return loaded.response;
    const { registration } = loaded;

    // The outstanding email is the one the staff member came here to send.
    // When there is none — everything already went out — the last email this
    // registration was due is rendered instead, so the panel can still show
    // what the runner received and resend it if they ask.
    const pending = outstandingEmail(registration);
    const kind = pending ?? latestEmailKind(registration);
    const message = emailForKind(registration, kind);

    return NextResponse.json({
      kind,
      label: EMAIL_KIND_LABELS[kind],
      outstanding: pending !== null,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      lastEmailError: registration.lastEmailError,
      manualEmailSentAt: registration.manualEmailSentAt,
      manualEmailSentBy: registration.manualEmailSentBy,
    });
  } catch (error: any) {
    console.error('Error rendering registration email:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * "I have sent this one myself."
 *
 * Nothing is sent from here — the staff member's own mail client did that.
 * This only records it, which is what takes the registration out of the
 * backlog. The kind is guarded rather than trusted, like every coded value
 * crossing the API, so a stale tab cannot stamp a column that was never owed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadRegistration(id);
    if (!loaded.ok) return loaded.response;
    const { registration } = loaded;

    const body = await request.json().catch(() => ({}));
    const kind = asEmailKind(body?.kind);
    if (!kind) {
      return NextResponse.json(
        { error: 'Say which email was sent: RECEIVED or CONFIRMATION.' },
        { status: 400 }
      );
    }

    const user = await getSignedInUser();
    await recordManualSend(registration.id, kind, user?.name ?? null);

    const updated = await prisma.registration.findUnique({
      where: { id: registration.id },
      select: {
        status: true,
        receivedEmailSentAt: true,
        confirmationEmailSentAt: true,
        lastEmailError: true,
        manualEmailSentAt: true,
        manualEmailSentBy: true,
      },
    });

    return NextResponse.json({
      success: true,
      registration: updated,
      // Recomputed rather than assumed: marking the receipt sent by hand does
      // not clear a received email that never went out either.
      outstanding: updated ? outstandingEmail(updated) : null,
    });
  } catch (error: any) {
    console.error('Error recording a manual email send:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
