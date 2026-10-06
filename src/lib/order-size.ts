/**
 * **How many runners one order may carry.**
 *
 * Every runner on an order reserves a slot in their category the moment the
 * order is written (`reserveSlots` in `lib/registration-gate.ts`), and an
 * unpaid order keeps holding them until the daily sweep lets them go
 * (`PENDING_EXPIRY_HOURS` in `lib/pending-expiry.ts`). The checkout throttle
 * (`CHECKOUT_RULE` in `lib/rate-limit.ts`) bounds how many orders an address
 * can place, but not how big each one is — without a ceiling here one POST
 * carrying a few hundred runners could hold a whole category for a day.
 *
 * Twenty covers what a real group registration looks like: a family, a
 * barkada, or a running club entering together, and every group promotion the
 * platform runs ("register 5, get 1 free" is six). A bigger club splits into
 * two orders.
 *
 * Both wizards stop adding runners at this number, and both checkout routes
 * refuse an order above it with a 400 — the routes are the last word, because
 * anything can POST.
 *
 * No database import: the wizards are client components and read the
 * constant from here.
 */
export const MAX_RUNNERS_PER_ORDER = 20;

/** What a runner reads once their order is full. */
export const ORDER_SIZE_LIMIT_MESSAGE =
  `One registration can hold up to ${MAX_RUNNERS_PER_ORDER} runners. ` +
  'Finish this one first, then register the rest of your group on a second registration.';

/**
 * Why an order is too big, or undefined when it is not. A missing or
 * malformed list is left to `participantCategoryError`, which already says
 * "add at least one runner".
 */
export function participantCountError(participants: unknown): string | undefined {
  if (!Array.isArray(participants) || participants.length <= MAX_RUNNERS_PER_ORDER) {
    return undefined;
  }
  return `This order has ${participants.length} runners. ${ORDER_SIZE_LIMIT_MESSAGE}`;
}
