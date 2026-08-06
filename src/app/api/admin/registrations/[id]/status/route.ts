import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

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

    return NextResponse.json({ success: true, registration: updatedRegistration });
  } catch (error: any) {
    console.error('Error updating status:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
