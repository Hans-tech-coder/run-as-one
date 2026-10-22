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
import { EVENT_FORMATS, RESULTS_ONLY_VIRTUAL_ERROR, readFormatFields } from '@/lib/event-format';
import { PUBLISH_INSTANT_ERROR, asPublishInstant, publishConflict } from '@/lib/event-visibility';
import { readCategoryChangeSettings } from '@/lib/category-change-settings';
import { readLogisticsChangeSettings } from '@/lib/logistics-change-settings';
import {
  OPENING_INSTANT_ERROR,
  asOpeningInstant,
  asSlotLimit,
} from '@/lib/registration-gate';
import { CATEGORY_ORDER } from '@/lib/category-order';
import { readClientLink } from '@/lib/client-store';
import { cleanHighlights } from '@/lib/event-highlights';
import { findProvince, inferProvince } from '@/lib/ph-address';

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
    const { title, date, province, imageUrl, highlights, sizeChartImageUrl, description, logisticsPickup, pickupLocation, pickupSchedule, logisticsDeliveryFeeInside, logisticsDeliveryFeeOutside, adminFee, shirtSizeUpcharge, consentWaiver, registrationForm, eventType, registrationOpensAt, categories, bankAccounts } = data;

    // A results-only race (RESULTS_ONLY_EVENT_PLAN.md): its client sells the
    // entries elsewhere and Run As One only publishes the times. Only a strict
    // `true` turns it on, so a missing or malformed field leaves the event
    // registrable as it always was.
    const resultsOnly = data.resultsOnly === true;

    if (!title || !date) {
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

    // On-site or virtual (VIRTUAL_RUN_PLAN.md): which decides whether a venue
    // and times are kept or a run window is — see lib/event-format.ts.
    const formatFields = readFormatFields(data, date);
    if (!formatFields.ok) {
      return NextResponse.json(
        { error: formatFields.error, errors: { [formatFields.field]: formatFields.error } },
        { status: 400 },
      );
    }
    const { format, virtualEndDate, location, startTime, endTime } = formatFields;
    if (resultsOnly && format === EVENT_FORMATS.VIRTUAL) {
      return NextResponse.json(
        { error: RESULTS_ONLY_VIRTUAL_ERROR, errors: { format: RESULTS_ONLY_VIRTUAL_ERROR } },
        { status: 400 },
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

    // When the public first sees it (EVENT_PUBLISH_PLAN.md): null keeps it a
    // draft, 'now' publishes it, an instant schedules it. A results-only race
    // is published at once (D6) — it has no page until its times are up
    // anyway, and the results flow has no publish step to take.
    const publishAt = resultsOnly ? new Date() : asPublishInstant(data.publishAt);
    if (publishAt === undefined) {
      return NextResponse.json({ error: PUBLISH_INSTANT_ERROR }, { status: 400 });
    }
    const publishProblem = resultsOnly ? null : publishConflict(publishAt, registrationOpens);
    if (publishProblem) {
      return NextResponse.json({ error: publishProblem }, { status: 400 });
    }

    // Category changes after payment (CATEGORY_CHANGE_PLAN.md): the deadline,
    // what a downgrade gives back and the change fee. Absent fields take the
    // column defaults — no deadline, NO_REFUND, no fee.
    const changeSettings = readCategoryChangeSettings(data);
    if (!changeSettings.ok) {
      return NextResponse.json(
        { error: changeSettings.error, errors: { [changeSettings.field]: changeSettings.error } },
        { status: 400 },
      );
    }
    // The delivery switch deadline (LOGISTICS_CHANGE_PLAN.md L11), refused
    // the same way; absent, the column keeps its null (7 days before race day).
    const switchSettings = readLogisticsChangeSettings(data);
    if (!switchSettings.ok) {
      return NextResponse.json(
        { error: switchSettings.error, errors: { [switchSettings.field]: switchSettings.error } },
        { status: 400 },
      );
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
          startTime,
          endTime,
          location,
          format,
          virtualEndDate,
          imageUrl: imageUrl || '',
          highlights: cleanHighlights(highlights),
          sizeChartImageUrl: sizeChartImageUrl || null,
          description: description || '',
          logisticsPickup: Boolean(logisticsPickup),
          // Where and when a kit is collected, in the organizer's own words.
          // Blank stays null rather than becoming an empty string: the wizards
          // fall back to standard wording on null (lib/pickup.ts), and an empty
          // string would render as a blank line under the pickup option.
          pickupLocation: pickupLocation?.trim() || null,
          pickupSchedule: pickupSchedule?.trim() || null,
          // The admin form collects pesos; storage is centavos.
          // Only a province on the list: the wizard compares the runner's
          // address against it to price delivery. Left unpicked, the one the
          // location names is saved instead (lib/ph-address.ts).
          province: findProvince(province)?.name ?? inferProvince(location)?.name ?? null,
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
          ...changeSettings.values,
          ...switchSettings.values,
          publishAt,
          resultsOnly,
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
              // Nothing is sold on a results-only race, so whatever the form
              // still holds in these two fields is not a price or a cap.
              price: resultsOnly ? 0 : toCentavos(cat.price),
              imageUrl: cat.imageUrl || null,
              // The form posts the textarea as typed; the list is what gets
              // stored, so blank lines and pasted bullets never reach the DB.
              inclusions: asInclusions(cat.inclusions),
              // Blank, 0 and anything unparseable all mean uncapped.
              slotLimit: resultsOnly ? null : asSlotLimit(cat.slotLimit),
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
          ...(created.resultsOnly ? { resultsOnly: true } : {}),
          publishAt: created.publishAt ? created.publishAt.toISOString() : 'draft',
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
