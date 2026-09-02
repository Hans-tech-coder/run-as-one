import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { toCentavos } from '@/lib/money';

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

    // discountValue is stored as an integer whose unit depends on discountType:
    // PERCENTAGE -> basis points (10% is sent as 10, stored as 1000)
    // FIXED      -> centavos    (₱500 is sent as 500, stored as 50000)
    // Both scale by 100, but they are different units — keep them distinguishable.
    const storedDiscountValue =
      discountType === 'PERCENTAGE'
        ? Math.round(Number(discountValue) * 100)
        : toCentavos(discountValue);

    const promo = await prisma.promoCode.create({
      data: {
        code,
        discountType,
        discountValue: storedDiscountValue,
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
