import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { normalizeAccountEmail } from '@/lib/text-case';
import { findAccountByEmail } from '@/lib/actor';
import { readOrganizerApplication } from '@/lib/organizer-application';

/**
 * An organizer asking for an account.
 *
 * This route writes the only row on the platform that a stranger can create,
 * which is why it does two jobs rather than one: it validates the whole
 * application (`lib/organizer-application.ts`, the same module the form uses,
 * so a tab left open cannot post past a rule the form enforces), and it
 * refuses an address either account table already holds.
 *
 * A refusal names the field it is refusing and hands the key back in `errors`,
 * so the form puts the caret in the right box rather than showing a catch-all
 * over a form the applicant has to re-read themselves (PROJECT_GUIDE §8 rule
 * 4). The catch-all `error` string is kept beside it for the same reason the
 * feedback route keeps one: something has to be readable when the failure
 * belongs to no field at all.
 *
 * The row is created `PENDING` and nothing else happens. No email, no session,
 * no access — the super admin approves, and only then does the account mean
 * anything.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { values, errors } = readOrganizerApplication(body);

    if (Object.keys(errors).length > 0) {
      const first = Object.values(errors)[0];
      return NextResponse.json({ error: first, errors }, { status: 400 });
    }

    // Stored lowercased, and the duplicate check runs against the same value.
    // Without it two accounts could exist for one address differing only in
    // case, and the unique index would not have stopped either of them --
    // whichever one the organizer then failed to type exactly would look, to
    // them, like a password that had stopped working.
    const accountEmail = normalizeAccountEmail(values.email);

    // Either account table: an address a staff member already signs in with
    // cannot become an organizer too, or sign-in would have to guess which of
    // the two the person meant.
    const existingUser = await findAccountByEmail(accountEmail);

    if (existingUser) {
      return NextResponse.json(
        {
          error: 'An account already uses that email address.',
          errors: {
            email:
              'An account already uses that address. Sign in instead, or apply with a different one.',
          },
        },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(values.password);

    const newOrganizer = await db.organizer.create({
      data: {
        email: accountEmail,
        name: values.name,
        password: hashedPassword,
        status: 'PENDING', // Super Admin must approve this

        // The application itself. Empty strings are written as null so a
        // screen reading them back has one absent value to test for rather
        // than two -- see hasApplicationDetails().
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
    });

    return NextResponse.json(
      {
        message: 'Registration successful. Please wait for Super Admin approval.',
        organizer: { id: newOrganizer.id, email: newOrganizer.email, status: newOrganizer.status }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Something went wrong during registration' },
      { status: 500 }
    );
  }
}
