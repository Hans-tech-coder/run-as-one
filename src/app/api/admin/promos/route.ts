import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { code, discountType, discountValue, usageLimit } = body;

    if (!code || !discountType || !discountValue) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const existingCode = await prisma.promoCode.findUnique({ where: { code } });
    if (existingCode) {
      return NextResponse.json({ error: 'Promo code already exists' }, { status: 400 });
    }

    const promo = await prisma.promoCode.create({
      data: {
        code,
        discountType,
        discountValue,
        usageLimit,
        organizerId: auth.id
      }
    });

    return NextResponse.json(promo);
  } catch (error: any) {
    console.error('Promo Creation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
