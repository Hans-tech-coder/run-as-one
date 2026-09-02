import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const event = await prisma.event.findUnique({
      where: { id },
      include: { organizer: true }
    });

    // adminFee is in centavos; 6000 = ₱60.00
    if (!event) {
      return NextResponse.json({ adminFee: 6000 });
    }

    return NextResponse.json({ adminFee: event.organizer.adminFee });
  } catch (error) {
    console.error('Failed to fetch admin fee:', error);
    return NextResponse.json({ adminFee: 6000 });
  }
}
