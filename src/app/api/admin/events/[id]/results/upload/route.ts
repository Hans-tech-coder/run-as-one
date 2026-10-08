import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { can, getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { upperCaseForStorage } from '@/lib/text-case';

// Helper to convert "HH:MM:SS" or "MM:SS" to seconds
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 999999;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 999999; // Fallback for invalid format
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The session says someone is signed in; it does not say this event is
    // theirs. Without this check an approved organizer could overwrite another
    // organizer's published finishing times from an id alone — the write half
    // of the same gap the results screen had on the read side. A STAFF member
    // additionally needs a role on this race that manages results, and is
    // refused with the same "not found" so the id cannot be probed.
    const event = await prisma.event.findFirst({
      where: { id, organizerId: actor.orgId },
      select: {
        id: true,
        title: true,
        resultsOnly: true,
        categories: { select: { id: true, name: true, sortOrder: true } },
      },
    });
    if (!event || !can(actor, 'results:manage', { organizerId: actor.orgId, eventId: id })) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventId = id;
    const body = await req.json();
    const { results } = body;

    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: 'Invalid or empty results data' }, { status: 400 });
    }

    // Categories founded by the upload, keyed by their stored (uppercase) name.
    // Only a results-only event may do this: its categories exist only to group
    // results. A registrable event's categories carry a price, a cap and
    // registrants, so they are made in the event form and nowhere else
    // (RESULTS_ONLY_EVENT_PLAN.md Batch 6).
    const newCategories = new Map<string, string>();
    const declared = Array.isArray(body.newCategories) ? body.newCategories : [];
    if (declared.length > 0 && !event.resultsOnly) {
      return NextResponse.json(
        { error: 'Only a results-only event can create its categories from the spreadsheet. Add the categories in Edit Event, then map each sheet to one.' },
        { status: 400 }
      );
    }
    const existingNames = new Set(event.categories.map(cat => upperCaseForStorage(cat.name)));
    for (const cat of declared) {
      const name = upperCaseForStorage(cat?.name);
      const distance = typeof cat?.distance === 'string' ? cat.distance.trim() : '';
      if (!name || !distance) {
        return NextResponse.json(
          { error: `Each new category needs a name and a distance${name ? `, and ${name} has no distance` : ''}.` },
          { status: 400 }
        );
      }
      if (existingNames.has(name) || newCategories.has(name)) {
        return NextResponse.json(
          { error: `This event already has a ${name} category. Map that sheet to it instead of creating another.` },
          { status: 400 }
        );
      }
      newCategories.set(name, distance);
    }

    // Every row must land in a category of this event: an existing one by id,
    // or one declared above by name. Unchecked, a row could carry another
    // race's category id and publish a time under it.
    const ownIds = new Set(event.categories.map(cat => cat.id));
    const NEW_KEY = 'new:';
    for (const r of results) {
      const known = r?.newCategory
        ? newCategories.has(upperCaseForStorage(r.newCategory))
        : ownIds.has(r?.categoryId);
      if (!known) {
        return NextResponse.json(
          { error: 'Some results point at a category that is not on this event. Reload the page and map the sheets again.' },
          { status: 400 }
        );
      }
    }

    // Prepare data by calculating seconds and deduplicating by bibNumber
    const uniqueResultsMap = new Map();
    
    results.forEach(r => {
      const chipSecs = parseTimeToSeconds(r.chipTime);
      const bibStr = String(r.bibNumber).trim();
      
      // Keep the first valid entry for a bibNumber
      if (!uniqueResultsMap.has(bibStr)) {
        uniqueResultsMap.set(bibStr, {
          eventId,
          // A new category has no id until the transaction makes it, so its
          // rows are grouped and ranked under its name and resolved there.
          categoryId: r.newCategory ? NEW_KEY + upperCaseForStorage(r.newCategory) : r.categoryId,
          bibNumber: bibStr,
          name: r.name,
          gender: r.gender,
          chipTime: r.chipTime,
          chipTimeSecs: chipSecs,
          gunTime: r.gunTime || null,
          overallRank: 0,
          genderRank: 0,
          categoryRank: 0,
          status: r.status || 'FINISHED'
        });
      }
    });

    const processedResults = Array.from(uniqueResultsMap.values());

    // Compute Overall Rank (across entire event, ascending by chipTimeSecs)
    processedResults.sort((a, b) => a.chipTimeSecs - b.chipTimeSecs);
    processedResults.forEach((r, idx) => {
      if (r.status === 'FINISHED') {
        r.overallRank = idx + 1;
      }
    });

    // Compute Category Rank
    const categoryGroups: Record<string, typeof processedResults> = {};
    processedResults.forEach(r => {
      if (!categoryGroups[r.categoryId]) categoryGroups[r.categoryId] = [];
      categoryGroups[r.categoryId].push(r);
    });

    for (const catId in categoryGroups) {
      const group = categoryGroups[catId];
      group.sort((a, b) => a.chipTimeSecs - b.chipTimeSecs);
      group.forEach((r, idx) => {
        if (r.status === 'FINISHED') r.categoryRank = idx + 1;
      });
    }

    // Compute Gender Rank per Category
    for (const catId in categoryGroups) {
      const group = categoryGroups[catId];
      
      const maleGroup = group.filter(r => {
        const g = r.gender.trim().toLowerCase();
        return g === 'male' || g === 'm';
      });
      maleGroup.sort((a, b) => a.chipTimeSecs - b.chipTimeSecs);
      maleGroup.forEach((r, idx) => { if (r.status === 'FINISHED') r.genderRank = idx + 1; });

      const femaleGroup = group.filter(r => {
        const g = r.gender.trim().toLowerCase();
        return g === 'female' || g === 'f';
      });
      femaleGroup.sort((a, b) => a.chipTimeSecs - b.chipTimeSecs);
      femaleGroup.forEach((r, idx) => { if (r.status === 'FINISHED') r.genderRank = idx + 1; });
    }

    // A declared category every one of whose rows lost its bib to an earlier
    // sheet is not made: it would sit on the event with no results.
    const usedNewNames = [...newCategories.keys()].filter(name =>
      processedResults.some(r => r.categoryId === NEW_KEY + name));

    // Perform DB Operations
    await prisma.$transaction(async (tx) => {
      // 0. The new categories, in the same transaction as the results that
      // need them, so a failed upload never leaves an empty one behind. Price
      // 0 and no cap, as the event routes store any results-only category;
      // they join the end of the event's list in the order the sheets came.
      const createdIds = new Map<string, string>();
      let nextSortOrder = Math.max(-1, ...event.categories.map(cat => cat.sortOrder)) + 1;
      for (const name of usedNewNames) {
        const created = await tx.category.create({
          data: {
            name,
            distance: newCategories.get(name)!,
            price: 0,
            slotLimit: null,
            sortOrder: nextSortOrder++,
            eventId,
          },
          select: { id: true },
        });
        createdIds.set(NEW_KEY + name, created.id);
      }

      // 1. Delete old results for this event (to replace them completely)
      const replaced = await tx.raceResult.deleteMany({
        where: { eventId }
      });

      // A results sheet replaces the published times wholesale, so the trail
      // says how many went and how many came — "somebody re-uploaded and the
      // podium changed" is exactly the question it will be asked.
      await recordAudit(tx, actor, {
        action: 'results.uploaded',
        entityType: 'Event',
        entityId: eventId,
        eventId,
        summary: (replaced.count > 0
          ? `Uploaded ${processedResults.length} results for ${event.title}, replacing ${replaced.count}.`
          : `Uploaded ${processedResults.length} results for ${event.title}.`)
          + (usedNewNames.length ? ` Created ${usedNewNames.join(', ')} from the spreadsheet.` : ''),
        changes: { results: [replaced.count, processedResults.length] },
      });

      // 2. Insert new results.
      // Chip times commonly carry tenths ("1:18:56.9"). The tenths decide the
      // ranking above, but chipTimeSecs is a whole-second column, so the value
      // is rounded here rather than left for the database to round.
      await tx.raceResult.createMany({
        data: processedResults.map(({ chipTimeSecs, ...rest }) => ({
          ...rest,
          categoryId: createdIds.get(rest.categoryId) ?? rest.categoryId,
          chipTimeSecs: Math.round(chipTimeSecs)
        }))
      });
    });

    return NextResponse.json({ message: 'Results uploaded successfully', count: processedResults.length }, { status: 200 });
  } catch (error) {
    console.error('Error uploading results:', error);
    return NextResponse.json({ error: 'Failed to upload results' }, { status: 500 });
  }
}
