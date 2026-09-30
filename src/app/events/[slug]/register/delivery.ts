import {
  DELIVERY_ZONES,
  deliveryZoneLabel,
  asDeliveryZone,
  type DeliveryZone,
} from '@/lib/registration-codes';
import { formatPesos } from '@/lib/money';
import { findProvince, inferProvince, samePlace } from '@/lib/ph-address';
import { parseDeliveryAddress } from './delivery-address';

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

type EventPlace = { province?: string | null; location?: string | null };

/**
 * The province the delivery tiers are measured from: the one the organizer
 * picked (`Event.province`), else the one the event's location names
 * ("Capitol Lingayen, Pangasinan"), so an event made before the picker existed
 * still prices delivery from the address. Null only when neither says.
 */
export function deliveryProvinceOf(event: EventPlace): string | null {
  return findProvince(event.province)?.name ?? inferProvince(event.location)?.name ?? null;
}

/**
 * The zone an address falls in, when the event's province is known
 * (deliveryProvinceOf). Inside when the runner's province is the same one,
 * Outside otherwise; null until the address names a province on the list, or when the
 * event has none set — then the runner still chooses (defaultDeliveryZone).
 */
export function zoneForProvince(
  event: EventPlace,
  addressProvince: string,
): DeliveryZone | null {
  const home = deliveryProvinceOf(event);
  // Only a province on the list counts: half-typed "TARL" is not "outside".
  if (!home || !findProvince(addressProvince)) return null;
  return samePlace(home, addressProvince)
    ? DELIVERY_ZONES.INSIDE
    : DELIVERY_ZONES.OUTSIDE;
}

/** Whether this event delivers to that zone at all (a fee of 0 = not offered). */
export function offersZone(
  event: { logisticsDeliveryFeeInside: number; logisticsDeliveryFeeOutside: number },
  zone: DeliveryZone | null,
): boolean {
  return deliveryTiers(event).some((t) => t.zone === zone);
}

/**
 * The zone a checkout is priced at. With the event's province set, the posted
 * zone is ignored and the one the address falls in is used instead — the
 * wizard never asked, and a tab that posts "INSIDE" for a Davao address must
 * not get the cheaper tier. Without it, the runner's own choice stands.
 */
export function resolveDeliveryZone(
  event: EventPlace,
  postedZone: unknown,
  deliveryAddress: string | null | undefined,
): DeliveryZone | null {
  if (!deliveryProvinceOf(event)) return asDeliveryZone(postedZone);
  return zoneForProvince(event, parseDeliveryAddress(deliveryAddress).province);
}

/**
 * What the address form says under the province once the zone is known from
 * it: the tier and its fee, or — when the event does not deliver there — why
 * not, so the runner can switch to pickup before pressing Next.
 */
export function zoneNoteFor(
  event: EventPlace & {
    logisticsDeliveryFeeInside: number;
    logisticsDeliveryFeeOutside: number;
  },
  zone: DeliveryZone | null,
): { text?: string; error?: string } | undefined {
  const home = deliveryProvinceOf(event);
  if (!home || !zone) return undefined;
  const inside = zone === DELIVERY_ZONES.INSIDE;
  if (!offersZone(event, zone)) {
    return {
      error: inside
        ? `This event only delivers outside ${home}. Choose On-site Pickup instead.`
        : `This event only delivers within ${home}. Choose On-site Pickup instead.`,
    };
  }
  return {
    text: `${inside ? 'Inside' : 'Outside'} ${home}: delivery fee ₱${formatPesos(deliveryFeeFor(event, zone))}`,
  };
}
