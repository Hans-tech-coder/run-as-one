import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyPassword, createToken, setAuthCookie } from '@/lib/auth';
import { normalizeAccountEmail } from '@/lib/text-case';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Lowercased before the lookup, never as typed: Postgres compares text
    // exactly, so one capital from a browser autofill used to find no row and
    // answer "Invalid credentials" for a password that was perfectly correct.
    // See normalizeAccountEmail in lib/text-case.ts for why this address is the
    // one email in the app that gets cased.
    const signInEmail = normalizeAccountEmail(email);

    if (!signInEmail || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const organizer = await db.organizer.findUnique({
      where: { email: signInEmail },
    });

    if (!organizer) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isPasswordValid = await verifyPassword(password, organizer.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    if (organizer.role !== 'SUPER_ADMIN') {
      if (organizer.status === 'PENDING') {
        return NextResponse.json(
          { error: 'Your account is pending approval by the Super Admin.' },
          { status: 403 }
        );
      }

      if (organizer.status === 'SUSPENDED') {
        return NextResponse.json(
          { error: 'Your account is suspended. Please contact support.' },
          { status: 403 }
        );
      }
    }

    // Account is approved, issue token
    const token = await createToken({ 
      id: organizer.id, 
      email: organizer.email, 
      name: organizer.name,
      role: organizer.role 
    });

    await setAuthCookie(token);

    return NextResponse.json({ success: true, role: organizer.role }, { status: 200 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Something went wrong during login' },
      { status: 500 }
    );
  }
}
