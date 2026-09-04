import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { toCentavos } from '@/lib/money';
import { asWaiverParagraphs } from '@/lib/consent-waiver';
import { asRegistrationForm } from '@/lib/registration-form';
import { asEventType } from '@/lib/event-type';
import { asInclusions } from '@/lib/inclusions';
import { asBankAccounts } from '@/lib/bank-accounts';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const event = await db.event.findUnique({
      where: { id },
      include: { categories: true, bankAccounts: { orderBy: { sortOrder: 'asc' } } }
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
    const { title, date, startTime, endTime, location, imageUrl, raceKitImageUrl, description, logisticsPickup, logisticsDeliveryFeeInside, logisticsDeliveryFeeOutside, adminFee, shirtSizeUpcharge, consentWaiver, registrationForm, eventType, certificateTemplate, certificateCoordinates, categories, bankAccounts } = data;

    if (!title || !date || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Handle category deletion carefully to avoid FK constraints
    const incomingIds = categories.filter((c: any) => c.id).map((c: any) => c.id);
    
    try {
      await db.category.deleteMany({
        where: { 
          eventId: id,
          id: { notIn: incomingIds }
        }
      });
    } catch (e: any) {
      if (e.code === 'P2003') {
        return NextResponse.json({ error: 'Cannot remove a category that already has registered runners or results.' }, { status: 400 });
      }
      throw e;
    }

    // Update event and upsert categories
    const updatedEvent = await db.$transaction(async (prisma) => {
      const ev = await prisma.event.update({
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
          // The admin form collects pesos; storage is centavos.
          logisticsDeliveryFeeInside: toCentavos(logisticsDeliveryFeeInside),
          logisticsDeliveryFeeOutside: toCentavos(logisticsDeliveryFeeOutside),
          adminFee: toCentavos(adminFee),
          shirtSizeUpcharge: toCentavos(shirtSizeUpcharge),
          // Empty means "use the standard wording" — see resolveConsentWaiver.
          consentWaiver: asWaiverParagraphs(consentWaiver),
          registrationForm: asRegistrationForm(registrationForm),
          eventType: asEventType(eventType),
          certificateTemplate: certificateTemplate || null,
          certificateCoordinates: certificateCoordinates || null,
        }
      });

      // Nothing in the schema references a bank account, so the simplest
      // correct update is to replace the set outright.
      await prisma.bankAccount.deleteMany({ where: { eventId: id } });
      const cleanAccounts = asBankAccounts(bankAccounts);
      if (cleanAccounts.length > 0) {
        await prisma.bankAccount.createMany({
          data: cleanAccounts.map((account, index) => ({
            ...account,
            sortOrder: index,
            eventId: id,
          })),
        });
      }

      for (const cat of categories) {
        if (cat.id) {
          await prisma.category.update({
            where: { id: cat.id },
            data: {
              name: cat.name,
              // A fun-run package has neither of these: no distance to run, and
              // a poster only if the organizer uploaded one.
              distance: cat.distance || '',
              price: toCentavos(cat.price),
              imageUrl: cat.imageUrl || null,
              // The form posts the textarea as typed; the list is what gets
              // stored, so blank lines and pasted bullets never reach the DB.
              inclusions: asInclusions(cat.inclusions),
            }
          });
        } else {
          await prisma.category.create({
            data: {
              name: cat.name,
              distance: cat.distance || '',
              price: toCentavos(cat.price),
              imageUrl: cat.imageUrl || null,
              inclusions: asInclusions(cat.inclusions),
              eventId: id,
            }
          });
        }
      }

      return await prisma.event.findUnique({
        where: { id },
        include: { categories: true, bankAccounts: { orderBy: { sortOrder: 'asc' } } }
      });
    });

    return NextResponse.json(updatedEvent, { status: 200 });
  } catch (error: any) {
    console.error('Update event error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update event' }, { status: 500 });
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
