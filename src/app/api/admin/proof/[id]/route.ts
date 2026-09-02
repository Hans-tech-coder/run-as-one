import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { signedProofUrl } from '@/lib/blob';

/**
 * Serves one registration's proof of payment to the admin who is allowed to
 * see it, by redirecting to a short-lived signed blob URL.
 *
 * Proofs used to live in public/uploads/proofs with a guessable-ish filename
 * and no auth at all — anyone who had a URL could read someone else's receipt.
 * Access is now checked on every view.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthCookie();
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const registration = await prisma.registration.findUnique({
    where: { id },
    select: {
      proofOfPayment: true,
      event: { select: { organizerId: true } },
    },
  });

  if (!registration?.proofOfPayment) {
    return NextResponse.json({ error: 'No proof of payment on file' }, { status: 404 });
  }

  // An organizer sees only their own event's registrations.
  if (auth.role !== 'SUPER_ADMIN' && registration.event.organizerId !== auth.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = await signedProofUrl(registration.proofOfPayment);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Failed to sign proof URL:', error);
    return NextResponse.json({ error: 'Could not load proof of payment' }, { status: 500 });
  }
}
