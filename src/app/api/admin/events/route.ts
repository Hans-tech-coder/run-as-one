import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { toCentavos } from '@/lib/money';
import { asWaiverParagraphs } from '@/lib/consent-waiver';
import { asRegistrationForm } from '@/lib/registration-form';
import { asEventType } from '@/lib/event-type';
import { asInclusions } from '@/lib/inclusions';
import { upperCaseForStorage } from '@/lib/text-case';
import { asBankAccounts } from '@/lib/bank-accounts';
import { uniqueEventSlug } from '@/lib/event-slug';
import { isCalendarDay } from '@/lib/event-schedule';
import {
  OPENING_INSTANT_ERROR,
  asOpeningInstant,
  asSlotLimit,
} from '@/lib/registration-gate';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { readClientLink } from '@/lib/client-store';

export async function POST(request: Request) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Creating a race is organizer-wide: a STAFF member works the races they
    // are assigned and never adds one.
    if (!can(actor, 'event:create', { organizerId: actor.orgId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = await request.json();
    const { title, date, startTime, endTime, location, imageUrl, raceKitImageUrl, description, logisticsPickup, pickupLocation, pickupSchedule, logisticsDeliveryFeeInside, logisticsDeliveryFeeOutside, adminFee, shirtSizeUpcharge, consentWaiver, registrationForm, eventType, registrationOpensAt, categories, bankAccounts } = data;

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

    // When sign-ups start, for a race published ahead of taking entries. The
    // form sends an instant it built from a Manila date and time, or nothing
    // at all for a race that is open straight away; a value that will not read
    // as an instant is refused rather than quietly stored as “open now”.
    const registrationOpens = asOpeningInstant(registrationOpensAt);
    if (registrationOpens === undefined) {
      return NextResponse.json({ error: OPENING_INSTANT_ERROR }, { status: 400 });
    }

    // Which client the race is for — only Run As One staff with
    // platform:manage may say (lib/client-store.ts); from anyone else the
    // field is ignored and the race starts with none.
    const clientLink = await readClientLink(actor, data.clientId);
    if (!clientLink.ok) {
      return NextResponse.json(
        { error: clientLink.error, errors: { clientId: clientLink.error } },
        { status: 400 },
      );
    }

    // The public URL is made from the title, so it is settled here, once, with
    // a counter appended if some other organizer already has that slug.
    const slug = await uniqueEventSlug(title, async (candidate) => {
      const clash = await db.event.findUnique({ where: { slug: candidate }, select: { id: true } });
      return clash !== null;
    });

    const newEvent = await db.$transaction(async (tx) => {
      const created = await tx.event.create({
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
          // Where and when a kit is collected, in the organizer's own words.
          // Blank stays null rather than becoming an empty string: the wizards
          // fall back to standard wording on null (lib/pickup.ts), and an empty
          // string would render as a blank line under the pickup option.
          pickupLocation: pickupLocation?.trim() || null,
          pickupSchedule: pickupSchedule?.trim() || null,
          // The admin form collects pesos; storage is centavos.
          logisticsDeliveryFeeInside: toCentavos(logisticsDeliveryFeeInside),
          logisticsDeliveryFeeOutside: toCentavos(logisticsDeliveryFeeOutside),
          adminFee: toCentavos(adminFee),
          shirtSizeUpcharge: toCentavos(shirtSizeUpcharge),
          // Empty means "use the standard wording" — see resolveConsentWaiver.
          consentWaiver: asWaiverParagraphs(consentWaiver),
          registrationForm: asRegistrationForm(registrationForm),
          eventType: asEventType(eventType),
          // Null is the usual answer: most races are registrable the moment
          // they are published, and only one listed early holds its button back.
          registrationOpensAt: registrationOpens,
          // The tenant, never the person: an event belongs to the organizer
          // whoever on its team created it, and the trail below names them.
          organizerId: actor.orgId,
          clientId: clientLink.change ? clientLink.clientId : null,
          bankAccounts: {
            create: asBankAccounts(bankAccounts).map((account, index) => ({
              ...account,
              sortOrder: index,
            })),
          },
          categories: {
            create: categories.map((cat: any, index: number) => ({
              // The position the organizer entered it in, fixed from here on —
              // an edit never renumbers it. See lib/category-order.ts.
              sortOrder: index,
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
              // Blank, 0 and anything unparseable all mean uncapped.
              slotLimit: asSlotLimit(cat.slotLimit),
            })),
          },
        },
        include: {
          categories: { orderBy: CATEGORY_ORDER },
        },
      });

      await recordAudit(tx, actor, {
        action: 'event.created',
        entityType: 'Event',
        entityId: created.id,
        eventId: created.id,
        summary: `Created event ${created.title} (${created.date}).`,
        changes: {
          categories: created.categories.length,
          ...(created.clientId ? { clientId: created.clientId } : {}),
        },
      });

      return created;
    });

    return NextResponse.json(newEvent, { status: 201 });
  } catch (error) {
    console.error('Create event error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
