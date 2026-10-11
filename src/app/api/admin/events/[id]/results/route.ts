import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getActor } from '@/lib/actor';
import { listFields, recordAudit } from '@/lib/audit';
import { parseTimeToSeconds } from '@/lib/results-ranking';
import { RESULT_STATUS_LABELS } from '@/lib/result-status';
import { normalizeBibNumber } from '@/lib/pacer';
import { resultPacerEvent } from '../result-pacers/result-pacer-scope';
import { checkResultFields, rerankRace } from './result-fields';

/**
 * *Add runner* in the Results workspace: one finisher the timer's sheet left
 * out, added by hand on any race under Results, without re-uploading the
 * sheet. Checked exactly as *Edit details* checks a row (`result-fields.ts`),
 * with a bib always required, since a runner's results page is found by it.
 *
 * In one transaction: the row, **stamped `editedAt` equal to its `createdAt`**
 * (so it reads *Added*, not *Edited*), which the upload counts
 * among the hand-made changes a new sheet replaces (the sheet stays the
 * source; a runner added here and missing from the next file goes with it),
 * every result of the race re-ranked with `rankResults`, and `results.added`
 * on the trail. A pacer tag already standing on the bib applies at once,
 * since tags ride on the bib.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const event = await resultPacerEvent(actor, id);
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const check = await checkResultFields(id, body, null);
    if (!check.ok) {
      return NextResponse.json({ field: check.field, error: check.error }, { status: check.status });
    }
    const { fields, category } = check;

    const created = await prisma.$transaction(
      async tx => {
        // One clock reading for both stamps: equal, they read as *Added*
        // rather than *Edited* (`handMade` in runner-row.ts).
        const now = new Date();
        const row = await tx.raceResult.create({
          data: {
            ...fields,
            eventId: id,
            chipTimeSecs: Math.round(fields.chipTime ? parseTimeToSeconds(fields.chipTime) : 0),
            overallRank: 0,
            categoryRank: 0,
            genderRank: 0,
            createdAt: now,
            editedAt: now,
          },
          select: { id: true },
        });

        // The new row counts among the moved when it finishes; the trail
        // names only the runners it pushed back.
        const moved = await rerankRace(tx, id);
        const pushed = moved - (fields.status === 'FINISHED' ? 1 : 0);
        const statusWord = fields.status === 'FINISHED' ? '' : ` ${RESULT_STATUS_LABELS[fields.status]}.`;
        await recordAudit(tx, actor, {
          action: 'results.added',
          entityType: 'RaceResult',
          entityId: row.id,
          eventId: id,
          summary: `Added ${fields.name} (bib ${fields.bibNumber}) to ${event.title} in ${category.name}.${statusWord}${
            pushed > 0 ? ` ${pushed} result${pushed === 1 ? '' : 's'} re-ranked.` : ''
          }`,
          changes: {
            name: [null, fields.name],
            bibNumber: [null, fields.bibNumber],
            gender: [null, fields.gender],
            categoryId: [null, category.name],
            chipTime: [null, fields.chipTime || null],
            gunTime: [null, fields.gunTime],
            status: [null, fields.status],
          },
        });
        return row;
      },
      // The re-rank reads and may write a whole race's rows.
      { timeout: 20_000 },
    );

    return NextResponse.json({ result: { id: created.id } }, { status: 201 });
  } catch (error) {
    console.error('Result Add Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** How many runners the trail names before it says "and N more". */
const NAMED_ON_TRAIL = 20;

/**
 * *Delete result* on a runner's row, or *Delete Selected* for the rows ticked
 * on the table (RESULTS_ROW_ACTIONS_PLAN.md Batch 5): `{ resultIds }`, one or
 * many, on any race under Results. For a runner who should not be on the
 * results at all — a duplicate, a test row, a runner added by mistake.
 *
 * Every id must be a result of this race, or nothing is deleted: a table
 * another tab has changed since it loaded gets a 409 and a reload rather than
 * a partial delete. In one transaction: the rows, a pacer tag on any of their
 * bibs (with no row it could never be seen or removed from the table), the
 * race re-ranked, and `results.deleted` naming each runner. A re-upload brings
 * back whoever is still in the sheet; nothing here keeps a deleted bib out.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const event = await resultPacerEvent(actor, id);
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const resultIds: string[] = Array.isArray(body?.resultIds)
      ? [...new Set<string>(body.resultIds.filter((v: unknown) => typeof v === 'string' && v))]
      : [];
    if (resultIds.length === 0) {
      return NextResponse.json({ error: 'Choose at least one result to delete.' }, { status: 400 });
    }

    const rows = await prisma.raceResult.findMany({
      where: { eventId: id, id: { in: resultIds } },
      orderBy: { overallRank: 'asc' },
      select: { id: true, name: true, bibNumber: true },
    });
    if (rows.length !== resultIds.length) {
      return NextResponse.json(
        { error: 'Some of these results are no longer on this race. Reload the page and choose again.' },
        { status: 409 },
      );
    }

    const deleted = await prisma.$transaction(
      async tx => {
        const gone = await tx.raceResult.deleteMany({ where: { eventId: id, id: { in: resultIds } } });
        const bibs = rows.map(r => normalizeBibNumber(r.bibNumber)).filter(Boolean);
        const tags = bibs.length
          ? await tx.resultPacer.deleteMany({ where: { eventId: id, bibNumber: { in: bibs } } })
          : { count: 0 };
        const moved = await rerankRace(tx, id);
        const left = await tx.raceResult.count({ where: { eventId: id } });

        const who = (r: (typeof rows)[number]) => `${r.name} (bib ${r.bibNumber || 'none'})`;
        const named = rows.slice(0, NAMED_ON_TRAIL).map(who);
        const more = rows.length - named.length;
        const list = more > 0 ? `${named.join(', ')} and ${more} more` : listFields(named);
        await recordAudit(tx, actor, {
          action: 'results.deleted',
          entityType: rows.length === 1 ? 'RaceResult' : 'Event',
          entityId: rows.length === 1 ? rows[0].id : id,
          eventId: id,
          summary: `Deleted ${rows.length === 1 ? '' : `${rows.length} results: `}${list} from ${event.title}.${
            tags.count > 0 ? ` Removed ${tags.count} pacer tag${tags.count === 1 ? '' : 's'}.` : ''
          }${moved > 0 ? ` ${moved} result${moved === 1 ? '' : 's'} re-ranked.` : ''}`,
          changes: { results: [left + gone.count, left] },
        });
        return gone.count;
      },
      // The re-rank reads and may write a whole race's rows.
      { timeout: 20_000 },
    );

    return NextResponse.json({ deleted });
  } catch (error) {
    console.error('Result Delete Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
