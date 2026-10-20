import {
  asLogisticsMethod,
  LOGISTICS_METHODS,
  type DeliveryZone,
} from "@/lib/registration-codes";
import { groupByAddress, type RunnerAddress } from "@/lib/runner-address";
import { pickupLabel } from "@/lib/pickup";
import {
  deliveryFeeFor,
  offersZone,
  resolveDeliveryZone,
  zoneForProvince,
} from "./delivery";

/**
 * Delivery at checkout, and how an old split order's parcels are read
 * (RUNNER_ADDRESS_PLAN.md Batch 2, as revised by the owner on 2026-10-20).
 *
 * **A group ships every kit to one address, for one fee.** Shipping each kit
 * to its runner's own home was offered until 2026-10-20 and is gone: neither
 * wizard offers it and `checkoutDelivery` no longer takes it, so every new
 * order is written `deliverySplit: false`.
 *
 * **Orders already split stay readable.** `Registration.deliverySplit` is kept,
 * and `shipmentsFor` still groups such an order's runners into one parcel per
 * home address — the registrants screen, the client's runner list, the
 * confirmation email and the delivery switch's paid-parcel check read them
 * through it.
 */

type DeliveryEvent = {
  province?: string | null;
  location?: string | null;
  format?: string | null;
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

/**
 * The checkout routes' answer for delivery: the zone and fee to store, or why
 * the order cannot ship. Pickup is zone null, fee 0. The zone follows the
 * address when the event's province is known (resolveDeliveryZone).
 */
export function checkoutDelivery(
  event: DeliveryEvent,
  input: {
    logisticsMethod: unknown;
    deliveryZone: unknown;
    deliveryAddress: string | null | undefined;
  },
): { error: string } | { zone: DeliveryZone | null; fee: number } {
  if (asLogisticsMethod(input.logisticsMethod) !== LOGISTICS_METHODS.DELIVERY) {
    return { zone: null, fee: 0 };
  }
  const zone = resolveDeliveryZone(event, input.deliveryZone, input.deliveryAddress);
  if (!offersZone(event, zone)) {
    return { error: `Delivery is not available to that address. Choose ${pickupLabel(event).toLowerCase()}, or check the province.` };
  }
  return { zone, fee: deliveryFeeFor(event, zone) };
}
