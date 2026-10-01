import {
  asLogisticsMethod,
  DELIVERY_ZONES,
  LOGISTICS_METHODS,
  type DeliveryZone,
} from "@/lib/registration-codes";
import { groupByAddress, type RunnerAddress } from "@/lib/runner-address";
import {
  deliveryFeeFor,
  deliveryProvinceOf,
  offersZone,
  resolveDeliveryZone,
  zoneForProvince,
} from "./delivery";

/**
 * Split shipping for a group order, shared by both wizards and both checkout
 * routes (RUNNER_ADDRESS_PLAN.md Batch 2).
 *
 * A group can ship every kit to one address — the delivery step's address,
 * which starts as Runner 1's home — or each kit to its runner's own home
 * address from Step 1. Runners who share an address make one shipment, and
 * every shipment pays the tier its province falls in against the event's.
 *
 * The choice is only offered when the Step 1 addresses actually differ, and
 * only when the event's province is known: without it the runner declares the
 * zone, and nobody can declare one per parcel without guessing. The routes
 * recompute the fee from the runners' addresses and never trust the posted
 * figure, the same rule every other amount at checkout lives under.
 */

type DeliveryEvent = {
  province?: string | null;
  location?: string | null;
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
};

type AddressedLike = Partial<Record<keyof RunnerAddress, unknown>>;

export interface Shipment {
  address: RunnerAddress;
  /** 0-based runner indexes. The first is who the courier asks for. */
  runners: number[];
  zone: DeliveryZone | null;
  /** Centavos; 0 when the event does not deliver there. */
  fee: number;
  offered: boolean;
}

/** One shipment per distinct address, in runner order. Pass resolved addresses. */
export function shipmentsFor(
  event: DeliveryEvent,
  runners: readonly AddressedLike[],
): Shipment[] {
  return groupByAddress(runners).map((group) => {
    const zone = zoneForProvince(event, group.address.addressProvince);
    const offered = offersZone(event, zone);
    return { ...group, zone, offered, fee: offered ? deliveryFeeFor(event, zone) : 0 };
  });
}

/** Whether to offer "each runner's own address" at all. */
export function canShipSeparately(
  event: DeliveryEvent,
  runners: readonly AddressedLike[],
): boolean {
  return deliveryProvinceOf(event) !== null && groupByAddress(runners).length > 1;
}

export function splitDeliveryFee(shipments: readonly Shipment[]): number {
  return shipments.reduce((sum, s) => sum + s.fee, 0);
}

/** "Runner 2", "Runners 2 and 3", "Runners 1, 2 and 4". */
export function runnersLabel(indexes: readonly number[]): string {
  const numbers = indexes.map((i) => String(i + 1));
  if (numbers.length === 1) return `Runner ${numbers[0]}`;
  return `Runners ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
}

/** "Inside Tarlac" / "Outside Tarlac", the way the fee note says it. */
export function shipmentZoneLabel(event: DeliveryEvent, zone: DeliveryZone | null): string {
  const home = deliveryProvinceOf(event);
  if (!home || !zone) return "";
  return `${zone === DELIVERY_ZONES.INSIDE ? "Inside" : "Outside"} ${home}`;
}

/** "This event does not deliver outside Tarlac" — for a shipment it cannot ship. */
export function notDeliveredNote(event: DeliveryEvent, zone: DeliveryZone | null): string {
  const label = shipmentZoneLabel(event, zone);
  return label
    ? `This event does not deliver ${label.charAt(0).toLowerCase()}${label.slice(1)}`
    : "This event does not deliver there";
}

/** Why a split cannot ship as it stands — the first shipment the event does not deliver to. */
export function splitDeliveryError(
  event: DeliveryEvent,
  shipments: readonly Shipment[],
): string | undefined {
  const blocked = shipments.find((s) => !s.offered);
  if (!blocked) return undefined;
  const who = runnersLabel(blocked.runners);
  return `${notDeliveredNote(event, blocked.zone)}, where ${who} ${
    blocked.runners.length === 1 ? "lives" : "live"
  }. Ship all kits to one address, or choose On-site Pickup.`;
}

/**
 * The checkout routes' answer for delivery: the zone and fee to store, and
 * whether it ships split — or why the order cannot ship. Pickup is zone null,
 * fee 0. Split ignores the posted zone and address; one-address delivery keeps
 * the rule it always had (resolveDeliveryZone).
 */
export function checkoutDelivery(
  event: DeliveryEvent,
  input: {
    logisticsMethod: unknown;
    deliveryZone: unknown;
    deliveryAddress: string | null | undefined;
    deliverySplit: unknown;
    participants: unknown;
  },
): { error: string } | { zone: DeliveryZone | null; fee: number; split: boolean } {
  if (asLogisticsMethod(input.logisticsMethod) !== LOGISTICS_METHODS.DELIVERY) {
    return { zone: null, fee: 0, split: false };
  }

  // JSON posts a boolean, the bank-transfer form posts the string.
  if (input.deliverySplit === true || input.deliverySplit === "true") {
    if (!deliveryProvinceOf(event)) {
      return { error: "This event cannot ship each kit separately. Ship all kits to one address instead." };
    }
    const runners = Array.isArray(input.participants) ? (input.participants as AddressedLike[]) : [];
    const shipments = shipmentsFor(event, runners);
    const error = splitDeliveryError(event, shipments);
    if (error) return { error };
    return { zone: null, fee: splitDeliveryFee(shipments), split: true };
  }

  const zone = resolveDeliveryZone(event, input.deliveryZone, input.deliveryAddress);
  if (!offersZone(event, zone)) {
    return { error: "Delivery is not available to that address. Choose on-site pickup, or check the province." };
  }
  return { zone, fee: deliveryFeeFor(event, zone), split: false };
}
