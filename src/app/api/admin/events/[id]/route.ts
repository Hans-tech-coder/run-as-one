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
import { asSlotLimit, takenSlotsByCategory } from '@/lib/registration-gate';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const event = await db.event.findUnique({
      where: { id },
      include: {
        categories: true,
        bankAccounts: { orderBy: { sortOrder: 'asc' } },
        // Only the count: the edit form locks the distances-or-packages choice
        // once anyone has registered, because switching it changes what those
        // runners already bought.
        _count: { select: { registrations: true } },
      }
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // How full each option already is, sent alongside it. An organizer typing
    // a slot limit needs to know they are capping at 100 an option that 120
    // runners are already in — the form says so under the field rather than
    // letting them find out from the public page.
    const taken = await takenSlotsByCategory(event.categories.map((c) => c.id));

    return NextResponse.json({
      ...event,
      categories: event.categories.map((category) => ({
        ...category,
        slotsTaken: taken.get(category.id) ?? 0,
      })),
    });
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
    const { title, date, startTime, endTime, location, imageUrl, raceKitImageUrl, description, logisticsPickup, logisticsDeliveryFeeInside, logisticsDeliveryFeeOutside, adminFee, shirtSizeUpcharge, consentWaiver, registrationForm, eventType, registrationPaused, registrationPauseNote, certificateTemplate, certificateCoordinates, categories, bankAccounts } = data;

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

    // The public URL follows the title, so renaming an event renames its link.
    // The slug is only recomputed when the title actually changed: a save that
    // leaves the title alone must never move the event's address, and an event
    // that took a "-2" suffix keeps it rather than reshuffling on every save.
    //
    // Renaming does retire the old slug. Links shared under it stop resolving,
    // though the /events/<cuid> form still redirects here, so a mid-campaign
    // title fix costs whoever shared the slug URL.
    const current = await db.event.findUnique({
      where: { id },
      select: { title: true, slug: true },
    });

    if (!current) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const slug = current.title === title
      ? current.slug
      : await uniqueEventSlug(title, async (candidate) => {
          const clash = await db.event.findUnique({
            where: { slug: candidate },
            select: { id: true },
          });
          // Its own row is not a clash — otherwise an event could never keep
          // the slug it already holds.
          return clash !== null && clash.id !== id;
        });

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
          // The organizer's manual hold on sign-ups. The note is theirs to
          // write and optional; blank falls back to the standard sentence in
          // lib/registration-gate.ts rather than leaving a runner unexplained.
          registrationPaused: Boolean(registrationPaused),
          registrationPauseNote: registrationPauseNote?.trim() || null,
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
              // Uppercased like the runner's own fields: this name is printed
              // beside them in the registrants table, the export and the emails.
              name: upperCaseForStorage(cat.name),
              // A fun-run package has neither of these: no distance to run, and
              // a poster only if the organizer uploaded one.
              distance: cat.distance || '',
              price: toCentavos(cat.price),
              imageUrl: cat.imageUrl || null,
              // The form posts the textarea as typed; the list is what gets
              // stored, so blank lines and pasted bullets never reach the DB.
              inclusions: asInclusions(cat.inclusions),
              // Blank, 0 and anything unparseable all mean uncapped. A limit
              // below what the option already holds is allowed on purpose:
              // that is how an organizer closes an option early, and the
              // runners already in it keep their places.
              slotLimit: asSlotLimit(cat.slotLimit),
            }
          });
        } else {
          await prisma.category.create({
            data: {
              name: upperCaseForStorage(cat.name),
              distance: cat.distance || '',
              price: toCentavos(cat.price),
              imageUrl: cat.imageUrl || null,
              inclusions: asInclusions(cat.inclusions),
              slotLimit: asSlotLimit(cat.slotLimit),
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

/**
 * The registration hold, on its own.
 *
 * Separate from PUT because the events table toggles it in place: sending the
 * whole event back to flip one boolean would mean the table holding — and
 * re-posting — every field of a form it does not show, and any of those it got
 * subtly wrong would be silently written.
 *
 * Unlike PUT, this scopes the update to the signed-in organizer's own events.
 * A pause is reachable from a list rather than from a form that only ever
 * opened one of their own events, so "who owns this id" is a question that has
 * to be asked here.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { registrationPaused, registrationPauseNote } = await request.json();

    if (typeof registrationPaused !== 'boolean') {
      return NextResponse.json(
        { error: 'registrationPaused must be true or false.' },
        { status: 400 }
      );
    }

    const event = await db.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.organizerId !== auth.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await db.event.update({
      where: { id },
      data: {
        registrationPaused,
        // Only written when the caller sent one, so toggling from the events
        // table never wipes a note the organizer wrote in the edit form.
        ...(registrationPauseNote === undefined
          ? {}
          : { registrationPauseNote: registrationPauseNote?.trim() || null }),
      },
      select: { id: true, registrationPaused: true, registrationPauseNote: true },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Pause registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update registration status' },
      { status: 500 }
    );
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
      where: { id },
      select: { id: true, organizerId: true },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (existingEvent.organizerId !== auth.id && auth.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Nothing cascades: every foreign key pointing at an event is ON DELETE
    // RESTRICT, so the dependent rows have to be removed children-first or
    // Postgres rejects the delete outright. Order matters — a runner points at
    // both a registration and a category, and a race result at both an event
    // and a category, so those go before the categories they reference.
    await db.$transaction(async (prisma) => {
      await prisma.runner.deleteMany({ where: { registration: { eventId: id } } });
      await prisma.registration.deleteMany({ where: { eventId: id } });
      await prisma.raceResult.deleteMany({ where: { eventId: id } });
      await prisma.category.deleteMany({ where: { eventId: id } });
      await prisma.bankAccount.deleteMany({ where: { eventId: id } });
      await prisma.event.delete({ where: { id } });
    });

    return NextResponse.json({ message: 'Event deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error('Delete event error:', error);
    // The message travels to the confirmation modal, so a failure names what
    // actually went wrong instead of a blank "something happened".
    return NextResponse.json({ error: error.message || 'Failed to delete event' }, { status: 500 });
  }
}
