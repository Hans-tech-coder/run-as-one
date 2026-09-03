/**
 * Delivery pricing, shared by both registration wizards.
 *
 * The two wizards are deliberately separate components, but the money must not
 * be. If one of them ever disagreed with the other about which tier costs what,
 * a runner would be charged the wrong amount — so the arithmetic lives here,
 * in one place, and both import it.
 */

export type DeliveryZone = 'inside' | 'outside';

export interface DeliveryTier {
  zone: DeliveryZone;
  label: string;
  /** Centavos. */
  fee: number;
}

/**
 * The tiers this event actually offers, in the order runners should see them.
 *
 * A fee of 0 means "not offered", the same convention the single delivery fee
 * already used before it was split in two. An event can therefore offer both
 * tiers, one, or neither.
 */
export function deliveryTiers(event: {
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
}): DeliveryTier[] {
  const tiers: DeliveryTier[] = [];

  if (event.logisticsDeliveryFeeInside > 0) {
    tiers.push({
      zone: 'inside',
      label: 'Inside Province',
      fee: event.logisticsDeliveryFeeInside,
    });
  }

  if (event.logisticsDeliveryFeeOutside > 0) {
    tiers.push({
      zone: 'outside',
      label: 'Outside Province',
      fee: event.logisticsDeliveryFeeOutside,
    });
  }

  return tiers;
}

/** Whether delivery is on offer at all. */
export function offersDelivery(event: {
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
}): boolean {
  return deliveryTiers(event).length > 0;
}

/**
 * What the chosen zone costs, in centavos.
 *
 * Returns 0 for a zone this event does not offer, so a stale selection can
 * never quietly bill a runner for a tier that is no longer on the page.
 */
export function deliveryFeeFor(
  event: { logisticsDeliveryFeeInside: number; logisticsDeliveryFeeOutside: number },
  zone: DeliveryZone | null,
): number {
  const tier = deliveryTiers(event).find((t) => t.zone === zone);
  return tier ? tier.fee : 0;
}

/**
 * Narrows an untrusted value to a zone. Anything else is null, which
 * deliveryFeeFor() prices at 0 — so a junk zone can never bill anyone.
 */
export function asDeliveryZone(value: unknown): DeliveryZone | null {
  return value === 'inside' || value === 'outside' ? value : null;
}

/**
 * The zone to start on. With only one tier available there is nothing to
 * choose, so it is picked for the runner; with two, they must decide.
 */
export function defaultDeliveryZone(event: {
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
}): DeliveryZone | null {
  const tiers = deliveryTiers(event);
  return tiers.length === 1 ? tiers[0].zone : null;
}
