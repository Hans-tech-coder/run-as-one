import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { sendRegistrationConfirmationEmail } from '@/lib/email';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const updatedRegistration = await prisma.registration.update({
      where: { id },
      data: { status }
    });

    // Manual (bank transfer) registrations only reach PAID here, once an admin
    // checks the proof — the online flow's equivalent moment is the PayMongo
    // webhook, which sends the same email from there instead.
    if (status === 'PAID') {
      const full = await prisma.registration.findUnique({
        where: { id },
        include: { event: true, runners: { include: { category: true } } },
      });
      if (full) await sendRegistrationConfirmationEmail(full);
    }

    return NextResponse.json({ success: true, registration: updatedRegistration });
  } catch (error: any) {
    console.error('Error updating status:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
