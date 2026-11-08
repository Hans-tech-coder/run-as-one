import type { Prisma } from '@prisma/client';
import { bibMedalName, type BibMedalValues } from '@/lib/bib-medal';
import { asSlotLimit } from '@/lib/registration-gate';

/**
 * Writes one parent's Bib + Medal row, inside the event save's transaction.
 * Shared by POST and PUT so the two cannot disagree on what a child looks like.
 *
 * Switching off deletes only a row nothing points at. "Nothing" is wider than
 * the runner count on screen: a cancelled runner, a race result or a past
 * category change all hold a foreign key, and a failed delete would abort the
 * whole save. Those rows are closed instead, and their history stays.
 *
 * A promo scoped to the row counts too, though its foreign key would not stop
 * the delete: PromoCategory cascades, and a promo left with no scope rows means
 * every category, so deleting a promo's only scope would make it event-wide.
 * promoPrices is left out on purpose: losing a price row only takes that price
 * away, and never widens what a promo covers.
 */
export async function syncBibMedalOption(
  tx: Pick<Prisma.TransactionClient, 'category'>,
  eventId: string,
  parent: { id: string; name: string; distance: string; sortOrder: number },
  existingId: string | undefined,
  // undefined: this save did not mention it, so it stays as it is.
  wanted: BibMedalValues | null | undefined,
) {
  if (wanted === undefined) return;

  const linked = { name: bibMedalName(parent.name), distance: parent.distance };

  if (wanted) {
    const values = {
      ...linked,
      price: wanted.price,
      inclusions: wanted.inclusions,
      slotLimit: asSlotLimit(wanted.slotLimit),
      closed: false,
    };
    if (existingId) {
      await tx.category.update({ where: { id: existingId, eventId }, data: values });
    } else {
      await tx.category.create({
        data: { ...values, sortOrder: parent.sortOrder, bibMedalOfId: parent.id, eventId },
      });
    }
    return;
  }

  if (!existingId) return;

  const usage = await tx.category.findUniqueOrThrow({
    where: { id: existingId },
    select: { _count: { select: { runners: true, raceResults: true, changesFrom: true, changesTo: true, promoScopes: true } } },
  });
  if (Object.values(usage._count).some(count => count > 0)) {
    await tx.category.update({ where: { id: existingId, eventId }, data: { ...linked, closed: true } });
  } else {
    await tx.category.delete({ where: { id: existingId, eventId } });
  }
}
