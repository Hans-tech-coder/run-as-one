import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createToken, getAuthCookie, setAuthCookie } from '@/lib/auth';

/**
 * The signed-in organizer editing their own name and email.
 *
 * The id comes from the auth cookie and never from the body: an organizer may
 * only ever edit themselves, so there is no id to pass and no id to forge.
 * Changing an account someone else owns is the super admin's screen, not this.
 */
export async function PATCH(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    // Trimmed but not lower-cased: login matches the stored address exactly,
    // so folding the case here would lock out anyone who registered with a
    // capital in their address and still types it that way.
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    // Keyed by field so the form can put each message under the input it is
    // about, rather than showing one catch-all line above the whole form.
    const errors: Record<string, string> = {};

    if (!name) {
      errors.name = 'Enter the name your runners should see';
    } else if (name.length > 100) {
      errors.name = 'Keep the name to 100 characters or fewer';
    }

    if (!email) {
      errors.email = 'Enter the email address you sign in with';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address, like you@example.com';
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Checked before the write so the organizer gets this message under the
    // email field; the unique index below is the backstop for the race.
    const taken = await prisma.organizer.findUnique({ where: { email } });
    if (taken && taken.id !== auth.id) {
      return NextResponse.json(
        { errors: { email: 'Another organizer already signs in with that email' } },
        { status: 409 }
      );
    }

    let organizer;
    try {
      organizer = await prisma.organizer.update({
        where: { id: auth.id },
        data: { name, email },
      });
    } catch (error: unknown) {
      // P2002 is Prisma's unique-constraint violation: someone claimed the
      // address between the check above and this write.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        return NextResponse.json(
          { errors: { email: 'Another organizer already signs in with that email' } },
          { status: 409 }
        );
      }
      throw error;
    }

    // The token carries the name and email, so a stale one would keep showing
    // the old details until it expired a day later. Reissue it here.
    const token = await createToken({
      id: organizer.id,
      email: organizer.email,
      name: organizer.name,
      role: organizer.role,
    });
    await setAuthCookie(token);

    return NextResponse.json({
      success: true,
      organizer: { id: organizer.id, name: organizer.name, email: organizer.email },
    });
  } catch (error) {
    console.error('Failed to update organizer profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
