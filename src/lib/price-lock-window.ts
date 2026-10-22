/**
 * How long a price lock lasts (PROMO_PRICE_LOCK_PLAN.md D1, R4): **45 minutes
 * shown to the runner, honoured 10 minutes longer by the server.**
 *
 * Its own module, with no imports, because both sides need the same numbers:
 * `price-lock.ts` signs tokens with the app secret and must never reach a
 * browser bundle, while the wizards need the window to decide whether a
 * promotion ends inside it (the countdown, D2). One pair of constants, so the
 * countdown a runner sees and the token the server reads cannot drift apart.
 */

/** How long a runner keeps the promotions they started with — the countdown. */
export const PRICE_LOCK_MINUTES = 45;

/** How long past the countdown the server still honours the lock. */
export const PRICE_LOCK_GRACE_MINUTES = 10;
