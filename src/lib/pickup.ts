/**
 * What a runner who chooses on-site pick-up is told.
 *
 * `logisticsPickup` used to be the whole story: a boolean the organizer ticked
 * as "Allow On-site Pickup (Free)", which said the option existed and nothing
 * about where or when. A runner picking it up therefore chose an address they
 * had never seen, and found out later — or asked.
 *
 * The organizer now writes both, and either may be blank because they often
 * settle the venue weeks before the hours. So the rule this module owns is:
 * **never show a pick-up option with nothing under it.** Whatever the
 * organizer has said is shown; what they have not said falls back to a
 * sentence that is honest about it, the same way a paused event falls back to
 * standard wording rather than a bare refusal (see registration-gate.ts).
 *
 * It lives here because the same words have to appear on the pick-up card in
 * both wizards, on the confirmation screen and in the registration email — the
 * moment of choosing, the moment of finishing, and the thing the runner still
 * has on race week.
 */

export type PickupEvent = {
  pickupLocation?: string | null;
  pickupSchedule?: string | null;
};

/** Shown when the organizer has recorded neither the place nor the hours. */
export const PICKUP_FALLBACK =
  'The organizer will confirm where and when to collect your race kit.';

/** Blank, whitespace and null all mean "not said yet". */
function said(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text.length > 0 ? text : null;
}

export function pickupDetails(event: PickupEvent): {
  location: string | null;
  schedule: string | null;
} {
  return {
    location: said(event.pickupLocation),
    schedule: said(event.pickupSchedule),
  };
}

/** Whether the organizer has said anything at all about collecting the kit. */
export function hasPickupDetails(event: PickupEvent): boolean {
  const { location, schedule } = pickupDetails(event);
  return location !== null || schedule !== null;
}

/**
 * The one-line form, for a place with room for a single sentence. Falls back
 * to PICKUP_FALLBACK rather than returning an empty string, so a caller cannot
 * accidentally render a blank where the pick-up details belong.
 */
export function pickupSummary(event: PickupEvent): string {
  const { location, schedule } = pickupDetails(event);
  if (location && schedule) return `${location} — ${schedule}`;
  return location ?? schedule ?? PICKUP_FALLBACK;
}
