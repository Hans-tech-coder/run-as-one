/**
 * Whether this event takes this order at all, before anything is priced.
 *
 * **The rule this module owns:** every door into a new order — the online
 * checkout, the bank-transfer checkout and a staff member encoding a runner's
 * order (STAFF_REGISTRATION_PLAN.md) — refuses on the same event-dependent
 * checks, in the same order, with the same words:
 *
 * 1. not published → 404 "Event not found" (a draft or scheduled event reads
 *    as missing, lib/event-visibility.ts);
 * 2. results-only → 400, refused before anything else about the order, since
 *    its client runs sign-ups elsewhere;
 * 3. every runner in one of this event's own options (an option from another
 *    event would be priced at ₱0 and skip the caps); then every runner's
 *    first and last name, as text with something in it (the forms require
 *    both, a direct post does not have to);
 * 4. a guardian for every runner 12 or under on race day (lib/minor-consent.ts);
 * 5. every runner's home address (lib/runner-address.ts);
 * 6. the race already held → 409;
 * 7. sign-ups closed for good → 409, before the hold so a closed race never
 *    says slots may open again;
 * 8. the organizer's pause → 409 with the organizer's own note;
 * 9. a race listed before it opens → 409 with the opening note.
 *
 * The event page and the wizard stop offering registration for all of these,
 * and neither is the last word: a tab opened before a hold went on still
 * posts. Split out of both checkout routes unchanged
 * (STAFF_REGISTRATION_PLAN.md step 0), so a third door cannot drift from them.
 */

import { isPublished } from './event-visibility';
import { hasFinished } from './event-schedule';
import { participantGuardianError } from './minor-consent';
import { participantAddressError } from './runner-address';
import {
  RESULTS_ONLY_MESSAGE,
  closedMessage,
  isClosed,
  openingNote,
  opensLater,
  participantCategoryError,
  pauseNote,
} from './registration-gate';

export type GatedEvent = Parameters<typeof isPublished>[0] &
  Parameters<typeof hasFinished>[0] &
  Parameters<typeof isClosed>[0] &
  Parameters<typeof opensLater>[0] &
  Parameters<typeof pauseNote>[0] & {
    resultsOnly: boolean;
    registrationPaused: boolean;
    date: unknown;
    categories: { id: string }[];
  };

export type GateRefusal = { error: string; status: 400 | 404 | 409 };

/**
 * The first check this order fails, or null. `event` null (not found) answers
 * the same 404 as an unpublished one.
 */
export function checkoutGateRefusal(
  event: GatedEvent | null,
  participants: unknown,
): GateRefusal | null {
  if (!event || !isPublished(event)) return { error: 'Event not found', status: 404 };
  if (event.resultsOnly) return { error: RESULTS_ONLY_MESSAGE, status: 400 };

  const categoryProblem = participantCategoryError(participants, event.categories);
  if (categoryProblem) return { error: categoryProblem, status: 400 };

  const nameProblem = participantNameError(participants);
  if (nameProblem) return { error: nameProblem, status: 400 };

  // Only now, because the age is taken on this event's date.
  const guardianProblem = participantGuardianError(participants, event.date);
  if (guardianProblem) return { error: guardianProblem, status: 400 };

  // The wizard posts each runner's resolved copy, "same as Runner 1"
  // included, so each one is checked and stored on its own row.
  const addressProblem = participantAddressError(participants);
  if (addressProblem) return { error: addressProblem, status: 400 };

  if (hasFinished(event)) {
    return { error: 'This race has already been held, so registration is closed.', status: 409 };
  }
  if (isClosed(event)) return { error: closedMessage(event), status: 409 };
  if (event.registrationPaused) return { error: pauseNote(event), status: 409 };
  if (opensLater(event)) return { error: openingNote(event), status: 409 };
  return null;
}

/**
 * The first runner missing a first or last name, or undefined. A name that is
 * not a string, or only spaces, counts as missing: the duplicate check and the
 * stored row both read it as text, and a blank one would save a nameless bib.
 */
export function participantNameError(participants: unknown): string | undefined {
  if (!Array.isArray(participants)) return undefined;
  const filled = (value: unknown) => typeof value === 'string' && value.trim() !== '';
  for (const [index, participant] of participants.entries()) {
    const p = (participant ?? {}) as { firstName?: unknown; lastName?: unknown };
    const missing = !filled(p.firstName) ? 'first name' : !filled(p.lastName) ? 'last name' : null;
    if (!missing) continue;
    return participants.length === 1
      ? `Enter the runner's ${missing}.`
      : `Runner ${index + 1}: enter the ${missing}.`;
  }
  return undefined;
}
