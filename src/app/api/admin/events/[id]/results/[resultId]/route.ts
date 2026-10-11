import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getActor } from '@/lib/actor';
import { listFields, recordAudit, type AuditChanges } from '@/lib/audit';
import { normalizeBibNumber } from '@/lib/pacer';
import { parseTimeToSeconds } from '@/lib/results-ranking';
import { RESULT_STATUS_LABELS } from '@/lib/result-status';
import { resultPacerEvent } from '../../result-pacers/result-pacer-scope';
import { checkResultFields, rerankRace } from '../result-fields';

/**
 * *Edit details* on one runner's row in the Results workspace
 * (RESULTS_ROW_ACTIONS_PLAN.md Batch 3, O4): a mistake in the timer's sheet
 * fixed without a re-upload, on any race under Results.
 *
 * Checked the way the upload reads a sheet (`result-fields.ts`, shared with
 * *Add runner*): the name stored uppercase, the bib unique in the race, the
 * category one of this race's, a chip time the ranking can read. Then, in one transaction: the row (with `editedAt`, which
 * the upload counts to warn a new sheet replaces this), a pacer tag on the old
 * bib moved to the new one, **every result of the race re-ranked** with
 * `rankResults` (the one ranking the upload uses), and the trail line naming
 * the old and new value of each field changed.
 *
 * A refusal names its field (`{ field, error }`), for the form to put the
 * message under the right box.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; resultId: string }> },
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, resultId } = await params;
    const event = await resultPacerEvent(actor, id);
    const result = event
      ? await prisma.raceResult.findFirst({ where: { id: resultId, eventId: id } })
      : null;
    if (!event || !result) {
      return NextResponse.json({ error: 'Result not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const check = await checkResultFields(id, body, result);
    if (!check.ok) {
      return NextResponse.json({ field: check.field, error: check.error }, { status: check.status });
    }
    const { fields: next, category } = check;
    const { name, bibNumber, chipTime, status } = next;
    const bibChanged = bibNumber !== result.bibNumber;

    const changes: AuditChanges = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (next[key] !== result[key]) changes[key] = [result[key] ?? null, next[key] ?? null];
    }
    if (Object.keys(changes).length === 0) {
      // Saved untouched: nothing to write, and no trail entry saying nothing.
      return NextResponse.json({ result: { id: result.id } });
    }

    const oldCategory =
      changes.categoryId
        ? await prisma.category.findUnique({ where: { id: result.categoryId }, select: { name: true } })
        : null;
    if (changes.categoryId) changes.categoryId = [oldCategory?.name ?? result.categoryId, category.name];

    await prisma.$transaction(
      async tx => {
        await tx.raceResult.update({
          where: { id: result.id },
          data: {
            ...next,
            chipTimeSecs: Math.round(chipTime ? parseTimeToSeconds(chipTime) : 0),
            editedAt: new Date(),
          },
        });

        // A tag rides on the bib (ResultPacer), so it follows the runner to
        // their new one. A tag already standing on the new bib belongs to no
        // runner (bibs are unique per race), so it is dropped rather than
        // pinned on this one.
        if (bibChanged) {
          const from = normalizeBibNumber(result.bibNumber);
          const to = normalizeBibNumber(bibNumber);
          if (from !== to) {
            const moving = from ? await tx.resultPacer.findFirst({ where: { eventId: id, bibNumber: from } }) : null;
            if (moving && to) {
              const stale = await tx.resultPacer.deleteMany({ where: { eventId: id, bibNumber: to } });
              if (stale.count > 0) changes.droppedPacerTag = [to, null];
              await tx.resultPacer.update({ where: { id: moving.id }, data: { bibNumber: to } });
              changes.pacerTag = [from, to];
            } else if (moving) {
              await tx.resultPacer.delete({ where: { id: moving.id } });
              changes.pacerTag = [from, null];
            }
          }
        }

        // Every result of the race, ranked again by the upload's own rule.
        const moved = await rerankRace(tx, id);

        const who = `${name} (bib ${bibNumber || 'none'})`;
        const fieldWords: Record<string, string> = {
          name: 'name', bibNumber: 'bib', gender: 'gender', categoryId: 'category',
          chipTime: 'chip time', gunTime: 'gun time', status: 'status',
        };
        const listed = Object.keys(changes).filter(key => key in fieldWords).map(key => fieldWords[key]);
        const statusWord = changes.status ? ` Now ${RESULT_STATUS_LABELS[status]}.` : '';
        await recordAudit(tx, actor, {
          action: 'results.edited',
          entityType: 'RaceResult',
          entityId: result.id,
          eventId: id,
          summary: `Corrected ${who} on ${event.title}: ${listFields(listed)}.${statusWord}${
            moved > 0 ? ` ${moved} result${moved === 1 ? '' : 's'} re-ranked.` : ''
          }`,
          changes,
        });
      },
      // The re-rank reads and may write a whole race's rows.
      { timeout: 20_000 },
    );

    return NextResponse.json({ result: { id: result.id } });
  } catch (error) {
    console.error('Result Edit Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
