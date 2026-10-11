import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getActor, type Actor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { paceGroupFromInput } from '@/lib/pacer';
import {
  NOT_RESULTS_ONLY_REFUSAL,
  finisherByBib,
  finisherLabel,
  resultPacerEvent,
} from '../result-pacer-scope';

/**
 * One pacer tag on a results-only race: *Edit pace group* (PATCH) and *Remove
 * pacer tag* (DELETE), from the runner's row (RESULTS_ROW_ACTIONS_PLAN.md
 * Batch 2). The bib is not editable here: a tag on the wrong runner is removed
 * and the right one marked, which reads plainly on the trail.
 *
 * Removing is allowed on any race, results-only or not, so a tag can never be
 * stranded where nothing could take it off. Changing one is not, by the same
 * rule as adding (O3).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; pacerId: string }> },
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, pacerId } = await params;
    const found = await findTag(actor, id, pacerId);
    if (!found) {
      return NextResponse.json({ error: 'Pacer tag not found.' }, { status: 404 });
    }
    const { event, tag } = found;
    if (!event.resultsOnly) {
      return NextResponse.json(NOT_RESULTS_ONLY_REFUSAL, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const group = paceGroupFromInput(body?.paceGroup);
    if ('problem' in group) {
      return NextResponse.json(group.problem, { status: 400 });
    }
    if (group.paceGroup === tag.paceGroup) {
      // Saved untouched: nothing to write, and no trail entry saying nothing.
      return NextResponse.json({ pacer: tag });
    }

    const who = finisherLabel(tag.bibNumber, await finisherByBib(id, tag.bibNumber));
    const updated = await prisma.$transaction(async tx => {
      const row = await tx.resultPacer.update({
        where: { id: tag.id },
        data: { paceGroup: group.paceGroup },
        select: { id: true, bibNumber: true, paceGroup: true },
      });
      await recordAudit(tx, actor, {
        action: 'result_pacer.updated',
        entityType: 'ResultPacer',
        entityId: tag.id,
        eventId: id,
        summary: `Pacer ${who} on ${event.title}: ${
          group.paceGroup ? `pace group set to ${group.paceGroup}` : 'pace group cleared'
        }.`,
        changes: { paceGroup: [tag.paceGroup, group.paceGroup] },
      });
      return row;
    });

    return NextResponse.json({ pacer: updated });
  } catch (error) {
    console.error('Result Pacer Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; pacerId: string }> },
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, pacerId } = await params;
    const found = await findTag(actor, id, pacerId);
    if (!found) {
      return NextResponse.json({ error: 'Pacer tag not found.' }, { status: 404 });
    }
    const { event, tag } = found;

    const who = finisherLabel(tag.bibNumber, await finisherByBib(id, tag.bibNumber));
    await prisma.$transaction(async tx => {
      await tx.resultPacer.delete({ where: { id: tag.id } });
      await recordAudit(tx, actor, {
        action: 'result_pacer.removed',
        entityType: 'ResultPacer',
        entityId: tag.id,
        eventId: id,
        summary: `Removed the pacer tag from ${who} on ${event.title}. They are ranked again.`,
        changes: { bibNumber: tag.bibNumber, paceGroup: tag.paceGroup },
      });
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Result Pacer Delete Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** This tag, if it is on this race and the actor may manage the race's results. */
async function findTag(actor: Actor, eventId: string, tagId: string) {
  const event = await resultPacerEvent(actor, eventId);
  if (!event) return null;
  const tag = await prisma.resultPacer.findFirst({
    where: { id: tagId, eventId },
    select: { id: true, bibNumber: true, paceGroup: true },
  });
  return tag ? { event, tag } : null;
}
