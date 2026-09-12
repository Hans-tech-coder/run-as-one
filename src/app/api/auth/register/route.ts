import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { normalizeAccountEmail } from '@/lib/text-case';

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    // Stored lowercased, and the duplicate check runs against the same value.
    // Without it two accounts could exist for one address differing only in
    // case, and the unique index would not have stopped either of them --
    // whichever one the organizer then failed to type exactly would look, to
    // them, like a password that had stopped working.
    const accountEmail = normalizeAccountEmail(email);

    if (!accountEmail || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    const existingUser = await db.organizer.findUnique({
      where: { email: accountEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);

    const newOrganizer = await db.organizer.create({
      data: {
        email: accountEmail,
        name,
        password: hashedPassword,
        status: 'PENDING', // Super Admin must approve this
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
