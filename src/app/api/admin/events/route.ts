import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { toCentavos } from '@/lib/money';
import { asRegistrationForm } from '@/lib/registration-form';
import { asEventType } from '@/lib/event-type';
import { asInclusions } from '@/lib/inclusions';

export async function POST(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { title, date, startTime, endTime, location, imageUrl, raceKitImageUrl, description, logisticsPickup, logisticsDeliveryFeeInside, logisticsDeliveryFeeOutside, adminFee, shirtSizeUpcharge, registrationForm, eventType, categories } = data;

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
        logisticsDeliveryFeeInside: toCentavos(logisticsDeliveryFeeInside),
        logisticsDeliveryFeeOutside: toCentavos(logisticsDeliveryFeeOutside),
        adminFee: toCentavos(adminFee),
        shirtSizeUpcharge: toCentavos(shirtSizeUpcharge),
        registrationForm: asRegistrationForm(registrationForm),
        eventType: asEventType(eventType),
        organizerId: auth.id,
        categories: {
          create: categories.map((cat: any) => ({
            name: cat.name,
            // A fun-run package has neither of these: no distance to run, and a
            // poster only if the organizer uploaded one.
            distance: cat.distance || '',
            price: toCentavos(cat.price),
            imageUrl: cat.imageUrl || null,
            // The form posts the textarea as typed; the list is what gets
            // stored, so blank lines and pasted bullets never reach the DB.
            inclusions: asInclusions(cat.inclusions),
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
