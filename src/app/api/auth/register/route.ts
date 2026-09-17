import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { normalizeAccountEmail } from '@/lib/text-case';
import { findAccountByEmail } from '@/lib/actor';
import { readOrganizerApplication } from '@/lib/organizer-application';

/**
 * An organization applying to have Run As One run its races.
 *
 * This route writes the only row on the platform that a stranger can create,
 * which is why it does two jobs rather than one: it validates the whole
 * application (`lib/organizer-application.ts`, the same module the form uses,
 * so a tab left open cannot post past a rule the form enforces), and it
 * refuses an address that already signs in or has already applied.
 *
 * A refusal names the field it is refusing and hands the key back in `errors`,
 * so the form puts the caret in the right box rather than showing a catch-all
 * over a form the applicant has to re-read themselves (PROJECT_GUIDE §8 rule
 * 4). The catch-all `error` string is kept beside it for the same reason the
 * feedback route keeps one: something has to be readable when the failure
 * belongs to no field at all.
 *
 * **What it writes is a `Client` submission, `NEW`, and nothing else**
 * (ADMIN_MERGE_PLAN.md, Batch 3). No account, no password, no session, no
 * email: nobody approves or rejects an application any more. It waits on
 * `/admin/clients` until Run As One staff press Send invite, and that
 * invitation is where the applicant chooses a password.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'The application could not be read.' }, { status: 400 });
    }

    const { values, errors } = readOrganizerApplication(body);

    if (Object.keys(errors).length > 0) {
      const first = Object.values(errors)[0];
      return NextResponse.json({ error: first, errors }, { status: 400 });
    }

    // Stored lowercased, and every duplicate check runs against the same value,
    // so one address differing only in case cannot apply twice.
    const email = normalizeAccountEmail(values.email);

    // An address that already signs in — Run As One's team, or a client's own
    // sign-in — cannot become a second submission: its invite would be refused.
    if (await findAccountByEmail(email)) {
      return NextResponse.json(
        {
          error: 'An account already uses that email address.',
          errors: {
            email:
              'An account already uses that address. Sign in instead, or apply with a different one.',
          },
        },
        { status: 400 },
      );
    }

    if (await db.client.findUnique({ where: { email }, select: { id: true } })) {
      return alreadyApplied();
    }

    const client = await db.client.create({
      data: {
        email,
        name: values.name,
        status: 'NEW',

        // Empty strings are written as null so a screen reading them back has
        // one absent value to test for rather than two -- see
        // hasApplicationDetails().
        orgType: values.orgType || null,
        city: values.city || null,
        province: values.province || null,
        website: values.website || null,
        experience: values.experience || null,
        contactFirstName: values.contactFirstName || null,
        contactLastName: values.contactLastName || null,
        contactRole: values.contactRole || null,
        phone: values.phone || null,
        services: values.services,
        firstEventName: values.firstEventName || null,
        firstEventDate: values.firstEventDate || null,
        firstEventLocation: values.firstEventLocation || null,
        expectedRunners: values.expectedRunners || null,
        applicationNote: values.applicationNote || null,
      },
      select: { id: true, email: true, status: true },
    });

    return NextResponse.json(
      { message: 'Application received.', client },
      { status: 201 },
    );
  } catch (error) {
    // The same address sent twice at once: the second loses the unique index.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return alreadyApplied();
    }
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Something went wrong while sending your application. Please try again.' },
      { status: 500 },
    );
  }
}

function alreadyApplied() {
  return NextResponse.json(
    {
      error: 'We already have an application from that email address.',
      errors: {
        email:
          'We already have an application from this address, so there is no need to send another. To add something, write to us instead.',
      },
    },
    { status: 400 },
  );
}
