import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { toCentavos } from '@/lib/money';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth || auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, adminFee } = body;

    const dataToUpdate: any = {};
    if (status !== undefined) dataToUpdate.status = status;
    // The superadmin UI collects pesos; storage is centavos.
    if (adminFee !== undefined) dataToUpdate.adminFee = toCentavos(adminFee);

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'No data provided to update' }, { status: 400 });
    }

    const updatedOrganizer = await prisma.organizer.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ success: true, organizer: updatedOrganizer });
  } catch (error) {
    console.error('Failed to update organizer:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
