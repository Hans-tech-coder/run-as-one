import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizers = await prisma.organizer.findMany({
      where: { role: 'ORGANIZER' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        adminFee: true,
        createdAt: true,
        _count: {
          select: { events: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ organizers });
  } catch (error) {
    console.error('Failed to fetch organizers:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
