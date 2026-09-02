import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { toCentavos } from '@/lib/money';

export async function POST(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { title, date, startTime, endTime, location, imageUrl, raceKitImageUrl, description, logisticsPickup, logisticsDeliveryFee, categories } = data;

    if (!title || !date || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newEvent = await db.event.create({
      data: {
        title,
        date,
        startTime: startTime || null,
        endTime: endTime || null,
        location,
        imageUrl: imageUrl || '',
        raceKitImageUrl: raceKitImageUrl || null,
        description: description || '',
        logisticsPickup: Boolean(logisticsPickup),
        // The admin form collects pesos; storage is centavos.
        logisticsDeliveryFee: toCentavos(logisticsDeliveryFee),
        organizerId: auth.id,
        categories: {
          create: categories.map((cat: any) => ({
            name: cat.name,
            distance: cat.distance,
            price: toCentavos(cat.price),
          })),
        },
      },
      include: {
        categories: true,
      },
    });

    return NextResponse.json(newEvent, { status: 201 });
  } catch (error) {
    console.error('Create event error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
