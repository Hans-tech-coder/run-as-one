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
import {
  canShipSeparately,
  shipmentsFor,
  splitDeliveryError,
  splitDeliveryFee,
} from "./delivery-split";
import { withResolvedAddresses, type AddressedRunner } from "./RunnerAddressFields";

/**
 * Step 2's delivery state for both wizards (RUNNER_ADDRESS_PLAN.md Batch 2).
 *
 * The delivery address starts as Runner 1's Step 1 home address and follows it
 * until the runner presses Change, which copies it into the editable fields.
 * ZIP, landmark and another receiver stay theirs to add either way. When the
 * runners' addresses differ (and the event's province is known) the group may
 * instead ship each kit to its runner's own address — delivery-split.ts.
 */

type DeliveryEvent = Parameters<typeof shipmentsFor>[0] & {
  logisticsDeliveryFeeInside: number;
  logisticsDeliveryFeeOutside: number;
};

/** What a cancelled checkout stored, for the restore. */
export interface RestoredDelivery {
  deliveryAddress?: string | null;
  deliveryZone?: string | null;
  deliverySplit?: boolean | null;
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
  const [splitChosen, setSplit] = useState(Boolean(restored?.deliverySplit));
  const [chosenZone, setChosenZone] = useState<DeliveryZone | null>(
    restored?.deliveryZone ? asDeliveryZone(restored.deliveryZone) : defaultDeliveryZone(event),
  );

  const delivering = logisticsMethod === "DELIVERY";
  const province = deliveryProvinceOf(event);
  const autoZone = province !== null;
  const splitOffered = canShipSeparately(event, resolved);
  // Falls back to one address on its own once the addresses agree again.
  const split = splitChosen && splitOffered;
  const shipments = splitOffered ? shipmentsFor(event, resolved) : [];

  const address: DeliveryAddressParts = ownAddress ? parts : { ...parts, ...home };
  const oneZone = autoZone ? zoneForProvince(event, address.province) : chosenZone;
  const oneFee = deliveryFeeFor(event, oneZone);
  const splitFee = splitDeliveryFee(shipments);
  const zone = split ? null : oneZone;
  const zoneNote = zoneNoteFor(event, oneZone);

  const tier = deliveryTiers(event).find((t) => t.zone === zone);
  // Blank when both zones cost the same: the runner was never asked, so the
  // pre-selected zone is not theirs to be shown (lib/registration-codes.ts).
  const feeLabel = split
    ? `${shipments.length} shipments`
    : tier
      ? deliveryZoneLabelFor(event, tier.zone)
      : "";

  /** Why Step 2 cannot go on yet, or null. */
  const problem = (): DeliveryProblem | null => {
    if (!delivering) return null;
    if (split) {
      const error = splitDeliveryError(event, shipments);
      return error ? { title: "Delivery not available", message: error } : null;
    }
    // Without the event's province the runner picks the area first; with
    // it, the area follows the province, which the address list covers.
    if (!autoZone && oneZone === null) {
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
    if (!offersZone(event, oneZone)) {
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
    fee: delivering ? (split ? splitFee : oneFee) : 0,
    /** For the summary: the zone, "2 shipments", or blank. */
    feeLabel,
    /** Posted as `deliveryZone`; null when split. */
    zone,
    /** Posted as `deliveryAddress`; blank when split. */
    address: split ? "" : composeDeliveryAddress(address),
    split,
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
      splitOffered,
      split,
      setSplit,
      shipments,
      oneFee: offersZone(event, oneZone) ? oneFee : null,
      splitFee: shipments.every((s) => s.offered) ? splitFee : null,
      zone: oneZone,
      chosenZone,
      setChosenZone,
      zoneNote,
      province,
      autoZone,
    },
  };
}

export type DeliveryPlan = ReturnType<typeof useDeliveryPlan>;
