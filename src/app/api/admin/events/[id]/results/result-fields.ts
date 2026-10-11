import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { upperCaseForStorage } from '@/lib/text-case';
import { genderDivision } from '@/lib/gender-division';
import { isRaceTime, rankResults } from '@/lib/results-ranking';
import { isResultStatus, type ResultStatus } from '@/lib/result-status';

/**
 * One runner's result as staff type it, for *Edit details* (PATCH
 * `results/[resultId]`) and *Add runner* (POST `results`): checked the way the
 * upload reads a sheet, so a row typed by hand and a row from the sheet hold
 * the same shape. Shared so the two forms can never accept different things.
 *
 * A refusal names its field, for the form to put the message under that box.
 */
export type ResultFields = {
  name: string;
  bibNumber: string;
  gender: string;
  categoryId: string;
  chipTime: string;
  gunTime: string | null;
  status: ResultStatus;
};

export type ResultFieldsCheck =
  | { ok: true; fields: ResultFields; category: { id: string; name: string } }
  | { ok: false; field: string; error: string; status: number };

/**
 * `current` is the row being edited, or null for a runner being added. An
 * edit keeps what the sheet stored where the form says the same thing (a
 * gender "M" opened and saved as Male), and may leave a row the sheet gave no
 * bib without one; a runner added by hand always has a bib, since their
 * results page is found by it.
 */
export async function checkResultFields(
  eventId: string,
  body: Record<string, unknown> | null,
  current: { id: string; bibNumber: string; gender: string; status: string } | null,
): Promise<ResultFieldsCheck> {
  const refuse = (field: string, error: string, status = 400) =>
    ({ ok: false, field, error, status }) as const;

  const name = upperCaseForStorage(body?.name);
  if (!name) return refuse('name', 'Enter the runner’s name.');

  // Trimmed only, as the upload stores it.
  const bibNumber = String(body?.bibNumber ?? '').trim();
  if (!bibNumber && (!current || current.bibNumber)) return refuse('bibNumber', 'Enter a bib number.');
  if (bibNumber && bibNumber !== current?.bibNumber) {
    // Case-blind, as the tags and the runner's page compare bibs.
    const holder = await prisma.raceResult.findFirst({
      where: {
        eventId,
        ...(current ? { id: { not: current.id } } : {}),
        bibNumber: { equals: bibNumber, mode: 'insensitive' },
      },
      select: { name: true, bibNumber: true },
    });
    if (holder) {
      return refuse('bibNumber', `Bib ${holder.bibNumber} is already ${holder.name}’s on this race.`, 409);
    }
  }

  // The form offers Male and Female. On an edit, a value that reads as the
  // same division ("M" for Male) keeps what the sheet stored.
  const genderIn = String(body?.gender ?? '').trim();
  const gender =
    current && genderDivision(genderIn) === genderDivision(current.gender) ? current.gender : genderIn;
  if (gender !== current?.gender && gender !== 'Male' && gender !== 'Female') {
    return refuse('gender', 'Choose Male or Female.');
  }

  const category = await prisma.category.findFirst({
    where: { id: String(body?.categoryId ?? ''), eventId },
    select: { id: true, name: true },
  });
  if (!category) return refuse('categoryId', 'Choose one of this race’s categories.');

  const status = body?.status ?? current?.status ?? 'FINISHED';
  if (!isResultStatus(status)) return refuse('status', 'Choose a status from the list.');

  // A finisher needs a time to be ranked by; a DNF or DNS may have none.
  const chipTime = String(body?.chipTime ?? '').trim();
  if (chipTime ? !isRaceTime(chipTime) : status === 'FINISHED') {
    return refuse('chipTime', 'Enter the chip time as H:MM:SS or MM:SS, like 1:18:56 or 45:12.');
  }
  const gunTimeIn = String(body?.gunTime ?? '').trim();
  if (gunTimeIn && !isRaceTime(gunTimeIn)) {
    return refuse('gunTime', 'Enter the gun time as H:MM:SS or MM:SS, or leave it blank.');
  }

  return {
    ok: true,
    fields: { name, bibNumber, gender, categoryId: category.id, chipTime, gunTime: gunTimeIn || null, status },
    category,
  };
}

/**
 * Every result of the race ranked again by the upload's own rule
 * (`rankResults`), inside the caller's transaction. Returns how many rows
 * changed place, for the trail.
 */
export async function rerankRace(tx: Prisma.TransactionClient, eventId: string): Promise<number> {
  const rows = await tx.raceResult.findMany({
    where: { eventId },
    orderBy: [{ overallRank: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, categoryId: true, gender: true, chipTime: true, status: true,
      overallRank: true, categoryRank: true, genderRank: true,
    },
  });
  const before = new Map(rows.map(r => [r.id, `${r.overallRank}|${r.categoryRank}|${r.genderRank}`]));
  rankResults(rows);
  const moved = rows.filter(r => before.get(r.id) !== `${r.overallRank}|${r.categoryRank}|${r.genderRank}`);
  if (moved.length > 0) {
    // One statement however many places move: a chip time fixed near the
    // front can shift hundreds of rows behind it.
    await tx.$executeRaw`
      UPDATE "RaceResult" AS r
      SET "overallRank" = v.o, "categoryRank" = v.c, "genderRank" = v.g
      FROM (
        SELECT
          unnest(${moved.map(m => m.id)}::text[]) AS id,
          unnest(${moved.map(m => m.overallRank)}::int[]) AS o,
          unnest(${moved.map(m => m.categoryRank)}::int[]) AS c,
          unnest(${moved.map(m => m.genderRank)}::int[]) AS g
      ) AS v
      WHERE r."id" = v.id`;
  }
  return moved.length;
}
