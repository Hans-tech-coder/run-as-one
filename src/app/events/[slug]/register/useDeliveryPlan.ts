"use client";

import { useState } from "react";
import {
  asDeliveryZone,
  deliveryZoneLabelFor,
  type LogisticsMethod,
} from "@/lib/registration-codes";
import { formatRunnerAddress, storedRunnerAddress, type RunnerAddress } from "@/lib/runner-address";
import {
  defaultDeliveryZone,
  deliveryFeeFor,
  deliveryProvinceOf,
  deliveryTiers,
  offersZone,
  zoneForProvince,
  zoneNoteFor,
  type DeliveryZone,
} from "./delivery";
import {
  ADDRESS_PART_LABELS,
  addressPartFieldId,
  composeDeliveryAddress,
  EMPTY_DELIVERY_ADDRESS,
  missingAddressParts,
  parseDeliveryAddress,
  type DeliveryAddressParts,
} from "./delivery-address";
import { withResolvedAddresses, type AddressedRunner } from "./RunnerAddressFields";

/**
 * Step 2's delivery state for both wizards (RUNNER_ADDRESS_PLAN.md Batch 2).
 *
 * The delivery address starts as Runner 1's Step 1 home address and follows it
 * until the runner presses Change, which copies it into the editable fields.
 * ZIP, landmark and another receiver stay theirs to add either way. A group
 * ships every kit to that one address, as one parcel with one fee: per-runner
 * shipping was removed (the owner, 2026-10-20).
 */

type DeliveryEvent = Parameters<typeof deliveryProvinceOf>[0] & {
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
};

/** What a cancelled checkout stored, for the restore. */
export interface RestoredDelivery {
  deliveryAddress?: string | null;
  deliveryZone?: string | null;
}

export interface DeliveryProblem {
  title: string;
  message: string;
  focusId?: string;
}

function placeOf(address: RunnerAddress) {
  return {
    street: address.addressStreet,
    barangay: address.addressBarangay,
    city: address.addressCity,
    province: address.addressProvince,
  };
}

function homeKey(parts: Pick<DeliveryAddressParts, "street" | "barangay" | "city" | "province">) {
  return formatRunnerAddress(
    storedRunnerAddress({
      addressStreet: parts.street,
      addressBarangay: parts.barangay,
      addressCity: parts.city,
      addressProvince: parts.province,
    }),
  );
}

export function useDeliveryPlan({
  event,
  runners,
  logisticsMethod,
  restored,
}: {
  event: DeliveryEvent;
  runners: readonly AddressedRunner[];
  logisticsMethod: LogisticsMethod;
  restored?: RestoredDelivery | null;
}) {
  const resolved = withResolvedAddresses(runners);
  const home = placeOf(resolved[0]);

  const [parts, setParts] = useState<DeliveryAddressParts>(() =>
    restored ? parseDeliveryAddress(restored.deliveryAddress) : EMPTY_DELIVERY_ADDRESS,
  );
  // Whether the place came from Runner 1's home or was typed here. An order
  // restored with some other address comes back typed, so it is not lost.
  const [ownAddress, setOwnAddress] = useState(() => {
    if (!restored?.deliveryAddress) return false;
    return homeKey(parseDeliveryAddress(restored.deliveryAddress)) !== homeKey(home);
  });
  const [chosenZone, setChosenZone] = useState<DeliveryZone | null>(
    restored?.deliveryZone ? asDeliveryZone(restored.deliveryZone) : defaultDeliveryZone(event),
  );

  const delivering = logisticsMethod === "DELIVERY";
  const province = deliveryProvinceOf(event);
  const autoZone = province !== null;

  const address: DeliveryAddressParts = ownAddress ? parts : { ...parts, ...home };
  const zone = autoZone ? zoneForProvince(event, address.province) : chosenZone;
  const fee = deliveryFeeFor(event, zone);
  const zoneNote = zoneNoteFor(event, zone);

  const tier = deliveryTiers(event).find((t) => t.zone === zone);
  // Blank when both zones cost the same: the runner was never asked, so the
  // pre-selected zone is not theirs to be shown (lib/registration-codes.ts).
  const feeLabel = tier ? deliveryZoneLabelFor(event, tier.zone) : "";

  /** Why Step 2 cannot go on yet, or null. */
  const problem = (): DeliveryProblem | null => {
    if (!delivering) return null;
    // Without the event's province the runner picks the area first; with
    // it, the area follows the province, which the address list covers.
    if (!autoZone && zone === null) {
      return {
        title: "Choose a delivery area",
        message: "Please choose whether delivery is inside or outside the province.",
      };
    }
    const missing = missingAddressParts(address);
    if (missing.length > 0) {
      return {
        title: "Delivery address incomplete",
        message: `Please fill in: ${missing.map((p) => ADDRESS_PART_LABELS[p]).join(", ")}.`,
        focusId: addressPartFieldId(missing[0]),
      };
    }
    if (!offersZone(event, zone)) {
      return {
        title: "Delivery not available",
        message: zoneNote?.error ?? "",
        focusId: ownAddress ? addressPartFieldId("province") : undefined,
      };
    }
    return null;
  };

  return {
    /** Centavos, 0 for pickup. */
    fee: delivering ? fee : 0,
    /** For the summary: the zone, or blank. */
    feeLabel,
    /** Posted as `deliveryZone`. */
    zone,
    /** Posted as `deliveryAddress`. */
    address: composeDeliveryAddress(address),
    problem,
    /** For DeliveryStep. */
    view: {
      parts: address,
      setParts,
      ownAddress,
      typeOwnAddress: () => {
        setParts(address);
        setOwnAddress(true);
      },
      useHomeAddress: () => setOwnAddress(false),
      homeText: formatRunnerAddress(resolved[0]),
      zone,
      chosenZone,
      setChosenZone,
      zoneNote,
      province,
      autoZone,
    },
  };
}

export type DeliveryPlan = ReturnType<typeof useDeliveryPlan>;
