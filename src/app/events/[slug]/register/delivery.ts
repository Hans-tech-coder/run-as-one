import {
  DELIVERY_ZONES,
  deliveryZoneLabel,
  type DeliveryZone,
} from '@/lib/registration-codes';

/**
 * Delivery pricing, shared by both registration wizards.
 *
 * The two wizards are deliberately separate components, but the money must not
 * be. If one of them ever disagreed with the other about which tier costs what,
 * a runner would be charged the wrong amount — so the arithmetic lives here,
 * in one place, and both import it.
 */

/**
 * The zone codes and the guard now live in lib/registration-codes.ts, beside
 * the other two coded columns on a Registration, so the stored spelling is
 * decided in one place. This module keeps what it was always for: the money.
 */
export { asDeliveryZone, type DeliveryZone } from '@/lib/registration-codes';

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
      zone: DELIVERY_ZONES.INSIDE,
      label: deliveryZoneLabel(DELIVERY_ZONES.INSIDE),
      fee: event.logisticsDeliveryFeeInside,
    });
  }

  if (event.logisticsDeliveryFeeOutside > 0) {
    tiers.push({
      zone: DELIVERY_ZONES.OUTSIDE,
      label: deliveryZoneLabel(DELIVERY_ZONES.OUTSIDE),
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
 * Whether the runner has to pick a delivery area. Only when the tiers cost
 * different amounts: with one tier, or two at the same fee, the answer changes
 * nothing they pay, so the wizard does not ask.
 */
export function needsDeliveryZoneChoice(event: {
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
}): boolean {
  const tiers = deliveryTiers(event);
  return tiers.length > 1 && tiers.some((t) => t.fee !== tiers[0].fee);
}

/**
 * The zone to start on. When there is no real choice (see
 * needsDeliveryZoneChoice) the first tier is picked for the runner; when the
 * fees differ, they must decide.
 */
export function defaultDeliveryZone(event: {
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
}): DeliveryZone | null {
  const tiers = deliveryTiers(event);
  return tiers.length > 0 && !needsDeliveryZoneChoice(event) ? tiers[0].zone : null;
}
