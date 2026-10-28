"use client";

import { useMemo } from "react";
import {
  addOnLineLabel,
  addOnLinesTotal,
  pickedAddOnLines,
  type AddOnPick,
  type AddOnRule,
} from "@/lib/add-ons";

/**
 * What the order's add-ons cost and how the summary lists them, for both
 * wizards (ADD_ONS_PLAN.md Batch 2): one line per runner per item,
 * `Runner 2 · COMMEMORATIVE SHIRT (M) × 1`, worded as the PayMongo page words
 * it (`addOnLineLabel`).
 *
 * Priced from the items the page was given, the way the checkouts price them
 * from the rows: listed price × quantity, never discounted (D5), no fee (D2).
 * A wizard whose figure disagrees with the server's gets the "Prices have
 * changed" 409, like any other figure.
 */
export function useAddOnTotals(
  participants: readonly { id: number | string; addOns?: readonly AddOnPick[] }[],
  addOns: readonly AddOnRule[] | null | undefined,
) {
  return useMemo(() => {
    const items = addOns ?? [];
    const addOnSummaryLines = participants.flatMap((runner, index) =>
      pickedAddOnLines(runner.addOns ?? [], items).map((line) => ({
        key: `${runner.id}-${line.addOnId}`,
        label: addOnLineLabel({ ...line, runnerNo: index + 1 }),
        amount: line.unitPrice * line.quantity,
      })),
    );
    const addOnTotal = addOnLinesTotal(
      participants.flatMap((runner) => pickedAddOnLines(runner.addOns ?? [], items)),
    );
    return { addOnTotal, addOnSummaryLines };
  }, [participants, addOns]);
}

/**
 * The note a runner's card shows after a category change took add-ons off
 * (`picksAllowedIn`), or null when it took none. `noun` is "category" or
 * "package", as the event calls its options.
 */
export function droppedAddOnsNotice(dropped: readonly string[], noun: string): string | null {
  if (dropped.length === 0) return null;
  return `${dropped.join(", ")} ${dropped.length === 1 ? "was" : "were"} removed: not offered with this ${noun}.`;
}
