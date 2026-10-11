import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getActor } from '@/lib/actor';
import { recordAudit } from '@/lib/audit';
import { normalizeBibNumber, paceGroupFromInput } from '@/lib/pacer';
import { codePacerForResult } from '@/lib/pacer-store';
import {
  NOT_RESULTS_ONLY_REFUSAL,
  finisherByBib,
  finisherLabel,
  resultPacerEvent,
} from './result-pacer-scope';

/**
 * *Mark as pacer* on a results-only race's results table
 * (RESULTS_ROW_ACTIONS_PLAN.md Batch 2, O3): the finisher with this bib is a
 * pacer, kept off the podium and out of the ranks, on every page that prints
 * one. No code and no admin fee — a results-only race takes no entries.
 *
 * Stored by bib (`ResultPacer`) and matched on read by `pacerLookupForEvent`,
 * so it holds across a re-upload of the same sheet. Refused:
 *
 *  - on a race that takes registrations (400): its pacers are its codes;
 *  - for a bib that is not on this race's results (400, naming it);
 *  - for a finisher who is already a pacer (409), by a tag here or by a code
 *    under Events, saying which, so staff know where to look.
 *
 * Under `results:manage`, the upload's own verb, and scoped like it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    if (!event.resultsOnly) {
      return NextResponse.json(NOT_RESULTS_ONLY_REFUSAL, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const bibNumber = normalizeBibNumber(body?.bibNumber);
    if (!bibNumber) {
      return NextResponse.json(
        { error: 'Say which finisher to mark: the bib number is missing.', field: 'bibNumber' },
        { status: 400 },
      );
    }

    const finisher = await finisherByBib(id, String(body.bibNumber).trim());
    if (!finisher) {
      return NextResponse.json(
        { error: `No result on ${event.title} has bib ${bibNumber}.`, field: 'bibNumber' },
        { status: 400 },
      );
    }
    const who = finisherLabel(finisher.bibNumber, finisher);

    const tagged = await prisma.resultPacer.findUnique({
      where: { eventId_bibNumber: { eventId: id, bibNumber } },
      select: { id: true },
    });
    if (tagged) {
      return NextResponse.json(
        { error: `${who} is already marked as a pacer here.`, field: 'bibNumber' },
        { status: 409 },
      );
    }
    if (await codePacerForResult(id, finisher)) {
      return NextResponse.json(
        {
          error: `${who} is already a pacer from a pacer code under Events. Change them on that race's Pacers screen.`,
          field: 'bibNumber',
        },
        { status: 409 },
      );
    }

    const group = paceGroupFromInput(body?.paceGroup);
    if ('problem' in group) {
      return NextResponse.json(group.problem, { status: 400 });
    }

    const tag = await prisma.$transaction(async tx => {
      const row = await tx.resultPacer.create({
        data: { eventId: id, bibNumber, paceGroup: group.paceGroup },
        select: { id: true, bibNumber: true, paceGroup: true },
      });
      await recordAudit(tx, actor, {
        action: 'result_pacer.added',
        entityType: 'ResultPacer',
        entityId: row.id,
        eventId: id,
        summary:
          `Marked ${who} as a pacer on ${event.title}` +
          (group.paceGroup ? `, pace group ${group.paceGroup}.` : '.'),
        changes: { bibNumber, paceGroup: group.paceGroup },
      });
      return row;
    });

    return NextResponse.json({ pacer: tag }, { status: 201 });
  } catch (error) {
    // Two presses racing past the check above meet the unique index instead.
    if ((error as { code?: string } | null)?.code === 'P2002') {
      return NextResponse.json(
        { error: 'That finisher is already marked as a pacer here.', field: 'bibNumber' },
        { status: 409 },
      );
    }
    console.error('Result Pacer Create Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
