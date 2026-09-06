import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuthCookie } from '@/lib/auth';
import { toCentavos } from '@/lib/money';
import { asWaiverParagraphs } from '@/lib/consent-waiver';
import { asRegistrationForm } from '@/lib/registration-form';
import { asEventType } from '@/lib/event-type';
import { asInclusions } from '@/lib/inclusions';
import { upperCaseForStorage } from '@/lib/text-case';
import { asBankAccounts } from '@/lib/bank-accounts';
import { uniqueEventSlug } from '@/lib/event-slug';
import { isCalendarDay } from '@/lib/event-schedule';

export async function POST(request: Request) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { title, date, startTime, endTime, location, imageUrl, raceKitImageUrl, description, logisticsPickup, logisticsDeliveryFeeInside, logisticsDeliveryFeeOutside, adminFee, shirtSizeUpcharge, consentWaiver, registrationForm, eventType, categories, bankAccounts } = data;

    if (!title || !date || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Which listing an event lands in is decided by comparing this string, so
    // the column has to hold a calendar day and nothing else. The admin form's
    // date picker only ever produces one; this is the guard for everything
    // else, because a "April 12, 2026" in here would sit in Upcoming forever.
    if (!isCalendarDay(date)) {
      return NextResponse.json(
        { error: 'Event date must be a calendar date in YYYY-MM-DD form.' },
        { status: 400 }
      );
    }

    // The public URL is made from the title, so it is settled here, once, with
    // a counter appended if some other organizer already has that slug.
    const slug = await uniqueEventSlug(title, async (candidate) => {
      const clash = await db.event.findUnique({ where: { slug: candidate }, select: { id: true } });
      return clash !== null;
    });

    const newEvent = await db.event.create({
      data: {
        title,
        slug,
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
        organizerId: auth.id,
        bankAccounts: {
          create: asBankAccounts(bankAccounts).map((account, index) => ({
            ...account,
            sortOrder: index,
          })),
        },
        categories: {
          create: categories.map((cat: any) => ({
            // Uppercased like the runner's own fields: this name is printed
            // beside them in the registrants table, the export and the emails.
            name: upperCaseForStorage(cat.name),
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
