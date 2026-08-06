import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const event = await db.event.findUnique({
      where: { id },
      include: { categories: true }
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json(event);
  } catch (error) {
    console.error('Fetch event error:', error);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const data = await request.json();
    const { title, date, startTime, endTime, location, imageUrl, raceKitImageUrl, description, logisticsPickup, logisticsDeliveryFee, categories } = data;

    if (!title || !date || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Update event and replace categories
    const updatedEvent = await db.$transaction(async (prisma) => {
      // Delete existing categories
      await prisma.category.deleteMany({
        where: { eventId: id }
      });

      // Update event and create new categories
      return await prisma.event.update({
        where: { id },
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
          logisticsDeliveryFee: Number(logisticsDeliveryFee) || 0,
          categories: {
            create: categories.map((cat: any) => ({
              name: cat.name,
              distance: cat.distance,
              price: Number(cat.price),
            })),
          },
        },
        include: {
          categories: true,
        },
      });
    });

    return NextResponse.json(updatedEvent, { status: 200 });
  } catch (error) {
    console.error('Update event error:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const existingEvent = await db.event.findUnique({
      where: { id }
    });

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (existingEvent.organizerId !== auth.id && auth.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete event (Categories are set to cascade delete in prisma schema, but we'll do a transaction just in case or trust Prisma)
    await db.$transaction(async (prisma) => {
      await prisma.category.deleteMany({
        where: { eventId: id }
      });
      
      await prisma.event.delete({
        where: { id }
      });
    });

    return NextResponse.json({ message: 'Event deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Delete event error:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
