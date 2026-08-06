import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    const existingUser = await db.organizer.findUnique({
      where: { email },
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
        email,
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
