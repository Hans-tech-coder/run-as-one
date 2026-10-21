import prisma from '@/lib/db';
import { can, type Actor } from '@/lib/actor';
import { RESULTS_EVENTS } from '@/lib/event-format';

/**
 * The race a pacer-tag route acts on, if this actor may manage its results;
 * *Edit details* (`results/[resultId]`) asks the same.
 *
 * Scoped by `organizerId` in the query and asked with the upload's own verb,
 * `results:manage`, because a tag or a corrected row changes the ranks on the
 * race's results as surely as an upload does. A race the actor cannot reach,
 * or a virtual run (which has no results, `RESULTS_EVENTS`), answers null, and
 * the routes say "not found" either way so an id cannot be probed.
 */
export async function resultPacerEvent(actor: Actor, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId: actor.orgId, ...RESULTS_EVENTS },
    select: { id: true, title: true, resultsOnly: true },
  });
  if (!event || !can(actor, 'results:manage', { organizerId: actor.orgId, eventId })) return null;
  return event;
}

/**
 * The refusal on a race that takes registrations: its pacers are its pacer
 * codes, set up under Events, and a second way to make one would leave staff
 * two places to look (RESULTS_ROW_ACTIONS_PLAN.md O1, O3).
 */
export const NOT_RESULTS_ONLY_REFUSAL = {
  error:
    'This race sets up its pacers under Events → Pacers, with their codes. Marking a pacer from the results is only for a results-only race.',
} as const;

/**
 * The finisher a tag's bib belongs to on this race, for naming them on the
 * trail. Compared case-blind, because the tag's bib went through
 * `normalizeBibNumber` and the upload stores the sheet's bib only trimmed.
 * Null when the last upload no longer has that bib; the tag still stands.
 */
export async function finisherByBib(eventId: string, bibNumber: string) {
  return prisma.raceResult.findFirst({
    where: { eventId, bibNumber: { equals: bibNumber, mode: 'insensitive' } },
    select: { id: true, bibNumber: true, name: true, categoryId: true, category: { select: { name: true } } },
  });
}

/** "JUAN DELA CRUZ (bib 123)", or "bib 123" when the bib is not on the results. */
export function finisherLabel(bibNumber: string, finisher: { name: string } | null): string {
  return finisher ? `${finisher.name} (bib ${bibNumber})` : `bib ${bibNumber}`;
}
